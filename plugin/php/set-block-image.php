<?php
/**
 * figmaWP image pipeline: import images by file name and put them on blocks (or as a featured image).
 * Template: copy to .figmawp/build/<YYYY-MM-DD>/images-<scope>.php and fill in $images.
 * See reference/image-pipeline.md.
 *
 * Supported targets: core/cover, core/image, core/media-text (image media), and 'featured'.
 * Idempotent: an attachment is matched by file name. If its file differs it is replaced in place
 * (same attachment, same URL, old file backed up); if it's the same, nothing happens. A block that
 * already shows the attachment is left alone. Targets are found by page path or by post type +
 * slug/title, never by ID. Post content is backed up before each write.
 *
 * Usage (WordPress root):
 *   wp eval-file <theme>/.figmawp/build/<date>/images-<scope>.php dry   # report only
 *   wp eval-file <theme>/.figmawp/build/<date>/images-<scope>.php       # write
 */

$images = array(
	// array(
	// 	'file'     => 'assets/images/compressed/hero-about.webp', // relative to the child theme
	// 	'title'    => 'About hero',
	// 	'alt'      => '',                                // empty = decorative
	// 	'target'   => array( 'page' => 'about' ),        // or array( 'post_type' => 'wp_template_part', 'slug' => 'header' )
	// 	                                                 // or array( 'post_type' => 'wp_block', 'title' => 'Hero' )
	// 	'block'    => 'core/cover',                      // core/cover | core/image | core/media-text | featured
	// 	'nth'      => 1,                                 // 1-based, document order, nested blocks included
	// 	'defaults' => array( 'dimRatio' => 50, 'focal' => array( 0.5, 0.5 ) ), // from images.blockDefaults; only fills unset attributes
	// 	'focal'    => null,                              // array( x, y ) to force a focal point (Cover, Media & Text)
	// ),
);

$dry    = in_array( 'dry', $args ?? array(), true );
$theme  = get_stylesheet_directory();
$script = basename( __FILE__, '.php' );
$bdir   = dirname( ABSPATH ) . '/figmawp-backups/' . gmdate( 'Ymd-His' ) . "-{$script}/";

require_once ABSPATH . 'wp-admin/includes/file.php';
require_once ABSPATH . 'wp-admin/includes/media.php';
require_once ABSPATH . 'wp-admin/includes/image.php';

$say = static function ( $msg ) use ( $dry ) {
	WP_CLI::log( ( $dry ? '[dry] ' : '' ) . $msg );
};

/** Attachment whose file name is exactly $name, or 0. */
$media_by_file = static function ( $name ) {
	$found = get_posts(
		array(
			'post_type'   => 'attachment',
			'post_status' => 'inherit',
			'numberposts' => 10,
			'meta_query'  => array( array( 'key' => '_wp_attached_file', 'value' => "/{$name}", 'compare' => 'LIKE' ) ), // phpcs:ignore WordPress.DB.SlowDBQuery
		)
	);
	foreach ( $found as $p ) {
		if ( basename( get_attached_file( $p->ID ) ) === $name ) {
			return $p->ID;
		}
	}
	return 0;
};

/** Import $path, or replace the attachment with the same file name in place. Returns the ID (0 in a dry run that would create one). */
$import = static function ( $path, $title, $alt ) use ( $dry, $say, $media_by_file, $bdir ) {
	$name = basename( $path );
	$id   = $media_by_file( $name );
	if ( $id ) {
		$current = get_attached_file( $id );
		if ( md5_file( $current ) === md5_file( $path ) ) {
			$say( "media {$name}: unchanged (attachment {$id})" );
			return $id;
		}
		$say( "media {$name}: replace in place (attachment {$id}, " . size_format( filesize( $path ) ) . ')' );
		if ( $dry ) {
			return $id;
		}
		wp_mkdir_p( $bdir );
		copy( $current, $bdir . $name );
		$old = wp_get_attachment_metadata( $id );
		foreach ( $old['sizes'] ?? array() as $size ) {
			$f = path_join( dirname( $current ), $size['file'] );
			if ( file_exists( $f ) ) {
				wp_delete_file( $f );
			}
		}
		if ( ! copy( $path, $current ) ) {
			WP_CLI::error( "Could not write {$current}" );
		}
		wp_update_attachment_metadata( $id, wp_generate_attachment_metadata( $id, $current ) );
		wp_update_post( array( 'ID' => $id ) ); // Bumps the modified date.
		return $id;
	}
	$say( "media {$name}: import (" . size_format( filesize( $path ) ) . ')' );
	if ( $dry ) {
		return 0;
	}
	$tmp = wp_tempnam( $name );
	copy( $path, $tmp );
	$id = media_handle_sideload( array( 'name' => $name, 'tmp_name' => $tmp ), 0, $title );
	if ( is_wp_error( $id ) ) {
		WP_CLI::error( "{$name}: " . $id->get_error_message() );
	}
	update_post_meta( $id, '_wp_attachment_image_alt', $alt );
	return $id;
};

/** The post a target points at. */
$find_target = static function ( $t ) {
	if ( ! empty( $t['page'] ) ) {
		return get_page_by_path( $t['page'] );
	}
	$q = array( 'post_type' => $t['post_type'], 'post_status' => 'any', 'numberposts' => 2 );
	if ( ! empty( $t['slug'] ) ) {
		$q['name'] = $t['slug'];
	}
	if ( ! empty( $t['title'] ) ) {
		$q['title'] = $t['title'];
	}
	$found = get_posts( $q );
	if ( count( $found ) > 1 ) {
		WP_CLI::error( 'More than one post matches ' . wp_json_encode( $t ) );
	}
	return $found[0] ?? null;
};

/** Point the first <img> in $html at the attachment (src + wp-image-N class). */
$swap_img = static function ( $html, $id, $url ) {
	return preg_replace_callback(
		'/<img\b[^>]*>/',
		static function ( $m ) use ( $id, $url ) {
			$tag = preg_replace( '/\ssrc="[^"]*"/', ' src="' . esc_url( $url ) . '"', $m[0] );
			$tag = preg_replace( '/\bwp-image-\d+\b/', "wp-image-{$id}", $tag, -1, $n );
			if ( ! $n ) {
				$tag = preg_match( '/\sclass="/', $tag )
					? preg_replace( '/\sclass="/', " class=\"wp-image-{$id} ", $tag, 1 )
					: preg_replace( '/<img\b/', "<img class=\"wp-image-{$id}\"", $tag, 1 );
			}
			return $tag;
		},
		$html,
		1
	);
};

/** Rewrite a Cover's saved markup to match its new attributes. */
$cover_html = static function ( $html, $id, $url, $alt, $focal, $dim ) {
	$pos = round( $focal[0] * 100 ) . '% ' . round( $focal[1] * 100 ) . '%';
	$img = sprintf(
		'<img class="wp-block-cover__image-background wp-image-%d" alt="%s" src="%s" style="object-position:%s" data-object-fit="cover" data-object-position="%s"/>',
		$id,
		esc_attr( $alt ),
		esc_url( $url ),
		$pos,
		$pos
	);
	$re = '/<img[^>]*class="[^"]*wp-block-cover__image-background[^"]*"[^>]*\/?>/';
	if ( preg_match( $re, $html ) ) {
		$html = preg_replace( $re, $img, $html, 1 );
	} elseif ( preg_match( '/<span[^>]*wp-block-cover__background[^>]*><\/span>/', $html ) ) {
		$html = preg_replace( '/(<span[^>]*wp-block-cover__background[^>]*><\/span>)/', '$1' . $img, $html, 1 );
	} else {
		$html = preg_replace( '/^(\s*<div[^>]*>)/', '$1' . $img, $html, 1 );
	}
	if ( null !== $dim ) {
		$html = preg_replace( '/has-background-dim-\d+/', 'has-background-dim-' . ( 10 * round( $dim / 10 ) ), $html, 1 );
	}
	return $html;
};

$done = 0;
foreach ( $images as $im ) {
	$path = path_join( $theme, $im['file'] );
	if ( ! is_readable( $path ) ) {
		WP_CLI::error( "Missing {$path} (has the theme been pushed?)" );
	}
	$post = $find_target( $im['target'] );
	if ( ! $post ) {
		WP_CLI::error( 'No post for target ' . wp_json_encode( $im['target'] ) );
	}
	$type  = $im['block'] ?? 'core/cover';
	$alt   = $im['alt'] ?? '';
	$def   = $im['defaults'] ?? array();
	$id    = $import( $path, $im['title'] ?? '', $alt );
	$where = ( 'page' === $post->post_type ? get_page_uri( $post ) : "{$post->post_type}:{$post->post_name}" ) . ' ' . $type . ( 'featured' === $type ? '' : " #{$im['nth']}" );

	if ( 'featured' === $type ) {
		if ( $id && (int) get_post_thumbnail_id( $post ) === $id ) {
			$say( "{$where}: already set" );
			continue;
		}
		$say( "{$where}: set to " . basename( $path ) );
		if ( ! $dry ) {
			set_post_thumbnail( $post, $id );
			++$done;
		}
		continue;
	}

	$url    = $id ? wp_get_attachment_url( $id ) : '(new upload)';
	$blocks = parse_blocks( $post->post_content );
	$count  = 0;
	$result = null; // 'same' | 'set' | 'unsupported'
	$walk   = static function ( array &$list ) use ( &$walk, &$count, &$result, $im, $type, $id, $url, $alt, $def, $cover_html, $swap_img ) {
		foreach ( $list as &$b ) {
			if ( null !== $result ) {
				return;
			}
			if ( ( $b['blockName'] ?? '' ) === $type && ++$count === (int) $im['nth'] ) {
				$a    = $b['attrs'];
				$html = $b['innerContent'][0] ?? '';
				if ( 'core/cover' === $type ) {
					if ( ! empty( $a['hasParallax'] ) || ! empty( $a['isRepeated'] ) || ! empty( $a['useFeaturedImage'] ) ) {
						$result = 'unsupported';
						return;
					}
					$focal = $im['focal'] ?? ( isset( $a['focalPoint'] ) ? array( $a['focalPoint']['x'], $a['focalPoint']['y'] ) : ( $def['focal'] ?? array( 0.5, 0.5 ) ) );
					$fp    = array( 'x' => $focal[0], 'y' => $focal[1] );
					if ( $id && ( $a['id'] ?? 0 ) === $id && ( $a['url'] ?? '' ) === $url && ( $a['focalPoint'] ?? null ) == $fp ) { // phpcs:ignore Universal.Operators.StrictComparisons
						$result = 'same';
						return;
					}
					$dim = null;
					if ( ! isset( $a['dimRatio'] ) && isset( $def['dimRatio'] ) ) {
						$a['dimRatio'] = (int) $def['dimRatio'];
						$dim           = $a['dimRatio'];
					}
					$a['url']        = $url;
					$a['id']         = $id;
					$a['focalPoint'] = $fp;
					$html            = $cover_html( $html, $id, $url, $alt, $focal, $dim );
				} elseif ( 'core/image' === $type ) {
					if ( $id && ( $a['id'] ?? 0 ) === $id ) {
						$result = 'same';
						return;
					}
					$a['id'] = $id;
					$size    = $a['sizeSlug'] ?? 'full';
					$src     = $id ? ( wp_get_attachment_image_url( $id, $size ) ?: $url ) : $url;
					$html    = $swap_img( $html, $id, $src );
				} elseif ( 'core/media-text' === $type ) {
					if ( ( $a['mediaType'] ?? 'image' ) !== 'image' ) {
						$result = 'unsupported';
						return;
					}
					if ( $id && ( $a['mediaId'] ?? 0 ) === $id ) {
						$result = 'same';
						return;
					}
					$a['mediaId']   = $id;
					$a['mediaType'] = 'image';
					unset( $a['mediaLink'] );
					$size = $a['mediaSizeSlug'] ?? 'full';
					$src  = $id ? ( wp_get_attachment_image_url( $id, $size ) ?: $url ) : $url;
					$html = $swap_img( $html, $id, $src );
					// Core saves the media image with "wp-image-N size-<slug>".
					$html = preg_replace_callback(
						'/(<figure[^>]*wp-block-media-text__media[^>]*>\s*<img\b[^>]*\sclass=")([^"]*)(")/',
						static function ( $m ) use ( $size ) {
							$classes = array_filter( preg_split( '/\s+/', preg_replace( '/\bsize-\S+/', '', $m[2] ) ) );
							$classes[] = "size-{$size}";
							return $m[1] . implode( ' ', $classes ) . $m[3];
						},
						$html,
						1
					);
				} else {
					$result = 'unsupported';
					return;
				}
				$b['attrs']           = $a;
				$b['innerContent'][0] = $html;
				$b['innerHTML']       = implode( '', array_filter( $b['innerContent'], 'is_string' ) );
				$result               = 'set';
				return;
			}
			if ( ! empty( $b['innerBlocks'] ) ) {
				$walk( $b['innerBlocks'] );
			}
		}
	};
	$walk( $blocks );

	if ( null === $result ) {
		WP_CLI::error( "{$where}: not found ({$count} {$type} block(s) in the content)." );
	}
	if ( 'unsupported' === $result ) {
		WP_CLI::warning( "{$where}: this block's setup (parallax, repeated, featured-image Cover, or non-image media) isn't supported; set it by hand." );
		continue;
	}
	if ( 'same' === $result ) {
		$say( "{$where}: already set" );
		continue;
	}
	$say( "{$where}: set to " . basename( $path ) );
	if ( $dry ) {
		continue;
	}
	wp_mkdir_p( $bdir );
	file_put_contents( $bdir . "{$post->post_type}-{$post->post_name}.html", $post->post_content ); // phpcs:ignore WordPress.WP.AlternativeFunctions
	wp_update_post( array( 'ID' => $post->ID, 'post_content' => wp_slash( serialize_blocks( $blocks ) ) ) );
	++$done;
}

WP_CLI::success( $dry ? 'Dry run finished; nothing written.' : "{$done} image(s) set." . ( $done ? " Backups: {$bdir}" : '' ) );
