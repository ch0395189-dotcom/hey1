-- Make the media bucket public so WhatsApp API can access the files
UPDATE storage.buckets SET public = true WHERE id = 'media';