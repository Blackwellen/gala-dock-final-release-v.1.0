-- SVG can carry script; uploads are restricted to raster images and PDFs.
update storage.buckets set allowed_mime_types = array['image/jpeg','image/png','image/webp','application/pdf'] where id = 'workspace-files';
