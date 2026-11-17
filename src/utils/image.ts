/**
 * Compress image files (ID cards, Shenasnameh pages) in browser so database stays fast and lightweight
 */
export async function readAndCompressDocument(file: File, maxDimension = 1280, quality = 0.76): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('خطا در خواندن فایل مدرک'));
    reader.onload = () => {
      const dataUrl = reader.result as string;
      // If PDF or non-image, limit size to ~2MB
      if (!file.type.startsWith('image/')) {
        if (file.size > 2.5 * 1024 * 1024) {
          reject(new Error('حجم فایل غیرتصویری باید کمتر از ۲.۵ مگابایت باشد.'));
          return;
        }
        resolve(dataUrl);
        return;
      }

      const img = new Image();
      img.onerror = () => resolve(dataUrl);
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}
