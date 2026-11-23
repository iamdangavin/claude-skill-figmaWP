<?php
/**
 * figmaWP: write a content manifest, one entry per piece of site content, keyed so it matches across
 * environments without IDs: "<type>:<path>". Used by /figmawp:pull to see what changed since the last
 * pull, on the source and on the target. Read-only.
 *
 * Usage (WordPress root):  wp eval-file content-manifest.php <out.json>
 * Over SSH (the script is sent on stdin):
 *   ssh <alias> 'cd <wpRoot> && mkdir -p ~/figmawp-tmp && wp eval-file - ~/figmawp-tmp/manifest.json' < content-manifest.php
 *
 * Entry: { "type", "path", "title", "status", "modified" (GMT), "hash" (md5 of title, content, excerpt, status, menu order, featured image file) }
 * Covered: every post type that stores site content (public types, wp_block, wp_navigation, wp_template,
 * wp_template_part, wp_global_styles), attachments (by file name), and Gravity Forms forms (by title) when active.
 */

$out = $args[0] ?? '';
if ( ! $out ) {
	WP_CLI::error( 'Pass the output file path.' );
}

$types = array_values(
	array_unique(
		array_merge(
			get_post_types( array( 'public' => true ) ),
			array( 'wp_block', 'wp_navigation', 'wp_template', 'wp_template_part', 'wp_global_styles' )
		)
	)
);
$types = array_diff( $types, array( 'attachment' ) );

$entries = array();
foreach ( $types as $type ) {
	$ids = get_posts(
		array(
			'post_type'        => $type,
			'post_status'      => array( 'publish', 'draft', 'pending', 'private', 'future' ),
			'numberposts'      => -1,
			'fields'           => 'ids',
			'suppress_filters' => true,
		)
	);
	foreach ( $ids as $id ) {
		$p    = get_post( $id );
		$path = is_post_type_hierarchical( $type ) ? get_page_uri( $p ) : $p->post_name;
		if ( in_array( $type, array( 'wp_template', 'wp_template_part', 'wp_global_styles' ), true ) ) {
			$terms = wp_get_post_terms( $id, 'wp_theme', array( 'fields' => 'names' ) );
			$path  = ( $terms[0] ?? '' ) . '//' . $p->post_name;
		}
		if ( '' === $path ) {
			$path = 'untitled-' . md5( $p->post_title . $p->post_date_gmt );
		}
		$entries[ "{$type}:{$path}" ] = array(
			'type'     => $type,
			'path'     => $path,
			'title'    => $p->post_title,
			'status'   => $p->post_status,
			'modified' => $p->post_modified_gmt,
			// The featured image counts by file name, since attachment IDs differ between environments.
			'hash'     => md5( $p->post_title . "\0" . $p->post_content . "\0" . $p->post_excerpt . "\0" . $p->post_status . "\0" . $p->menu_order . "\0" . get_post_meta( (int) get_post_thumbnail_id( $p ), '_wp_attached_file', true ) ),
		);
	}
}

$attachments = get_posts( array( 'post_type' => 'attachment', 'post_status' => 'inherit', 'numberposts' => -1, 'fields' => 'ids' ) );
foreach ( $attachments as $id ) {
	$file = (string) get_post_meta( $id, '_wp_attached_file', true );
	if ( '' === $file ) {
		continue;
	}
	$p                               = get_post( $id );
	$entries[ "attachment:{$file}" ] = array(
		'type'     => 'attachment',
		'path'     => $file,
		'title'    => $p->post_title,
		'status'   => $p->post_status,
		'modified' => $p->post_modified_gmt,
		'hash'     => md5( $p->post_title . "\0" . $p->post_excerpt . "\0" . get_post_meta( $id, '_wp_attachment_image_alt', true ) . "\0" . wp_json_encode( wp_get_attachment_metadata( $id ) ) ),
	);
}

if ( class_exists( 'GFAPI' ) ) {
	foreach ( GFAPI::get_forms( null ) as $form ) {
		$key = 'gf_form:' . sanitize_title( $form['title'] );
		unset( $form['id'], $form['date_created'] );
		$entries[ $key ] = array(
			'type'     => 'gf_form',
			'path'     => sanitize_title( $form['title'] ),
			'title'    => $form['title'],
			'status'   => empty( $form['is_active'] ) ? 'inactive' : 'active',
			'modified' => null,
			'hash'     => md5( wp_json_encode( $form ) ),
		);
	}
}

ksort( $entries );
$manifest = array(
	'site'    => home_url(),
	'takenAt' => gmdate( 'c' ),
	'entries' => $entries,
);
if ( false === file_put_contents( $out, wp_json_encode( $manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) ) ) { // phpcs:ignore WordPress.WP.AlternativeFunctions
	WP_CLI::error( "Could not write {$out}" );
}
WP_CLI::success( count( $entries ) . " entries written to {$out}" );
