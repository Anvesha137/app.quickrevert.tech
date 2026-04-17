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
    if (!file) return reject(new Error('No file provided for compression'));

    const reader = new FileReader();
    
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
        if (!ctx) return reject(new Error('Failed to get canvas context (memory issue?)'));
        ctx.drawImage(img, 0, 0, width, height);

        // Iteratively reduce quality until under maxSize or quality is too low
        let quality = 0.9;
        const compress = () => {
          try {
            canvas.toBlob(
              (blob) => {
                if (!blob) return reject(new Error('Compression failed: output is empty'));
                
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
          } catch (e) {
            reject(new Error('Canvas compression failed: ' + (e as Error).message));
          }
        };
        compress();
      };
      img.onerror = () => reject(new Error('This image file is corrupted or not a valid image. Please try a different one.'));
    };

    reader.onerror = () => {
      console.error('FileReader error:', reader.error);
      reject(new Error('We couldn\'t access this file. It might have been moved, deleted, or blocked by browser security. Please re-select the image.'));
    };

    try {
      reader.readAsDataURL(file);
    } catch (e) {
       reject(new Error('Initialization failed: ' + (e as Error).message));
    }
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
