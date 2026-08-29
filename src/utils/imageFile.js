/** Muat File gambar menjadi HTMLImageElement + dimensi aslinya. */
export function loadImageElement(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ img, url, width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Gagal membuka "${file.name}". File mungkin rusak atau bukan gambar valid.`));
    };
    img.src = url;
  });
}

export function hasAlphaChannel(file) {
  return file.type === 'image/png' || /\.png$/i.test(file.name);
}
