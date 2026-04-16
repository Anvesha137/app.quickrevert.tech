import { supabase } from './supabase';

/**
 * Compresses an image file to be under a certain size (default 100KB)
 * @param file The original file
 * @param maxSizeInBytes The target maximum size
 * @returns A compressed blob or the original if already small enough
 */
export const compressImage = async (file: File, maxSizeInBytes: number = 102400): Promise<Blob | File> => {
  if (file.size <= maxSizeInBytes) return file;

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        // Start with a reasonable scale-down if image is huge
        const maxDimension = 1200;
        if (width > maxDimension || height > maxDimension) {
          const ratio = Math.min(maxDimension / width, maxDimension / height);
          width *= ratio;
          height *= ratio;
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Failed to get canvas context'));
        ctx.drawImage(img, 0, 0, width, height);

        // Iteratively reduce quality until under maxSize or quality is too low
        let quality = 0.9;
        const compress = () => {
          canvas.toBlob(
            (blob) => {
              if (!blob) return reject(new Error('Compression failed'));
              
              if (blob.size <= maxSizeInBytes || quality <= 0.2) {
                resolve(blob);
              } else {
                quality -= 0.1;
                compress();
              }
            },
            'image/jpeg',
            quality
          );
        };
        compress();
      };
      img.onerror = () => reject(new Error('Failed to load image'));
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
  });
};

/**
 * Uploads a file to the automation-assets bucket
 * @param file The file to upload
 * @returns The public URL of the uploaded file
 */
export const uploadAutomationAsset = async (file: File): Promise<string> => {
  // 1. Compress if it's an image
  let uploadData: Blob | File = file;
  if (file.type.startsWith('image/')) {
    uploadData = await compressImage(file, 102400); // 100KB limit
  }

  // 2. Generate a unique filename
  const fileExt = file.name.split('.').pop() || (file.type === 'image/jpeg' ? 'jpg' : 'png');
  const fileName = `${Math.random().toString(36).substring(2, 15)}_${Date.now()}.${fileExt}`;
  const filePath = `uploads/${fileName}`;

  // 3. Upload to Supabase Storage
  const { data, error } = await supabase.storage
    .from('automation-assets')
    .upload(filePath, uploadData, {
      contentType: file.type,
      cacheControl: '3600',
      upsert: false
    });

  if (error) throw error;

  // 4. Get Public URL
  const { data: { publicUrl } } = supabase.storage
    .from('automation-assets')
    .getPublicUrl(filePath);

  return publicUrl;
};
