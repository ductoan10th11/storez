// Thu nhỏ ảnh ở trình duyệt trước khi tải lên: cạnh dài tối đa 1600 px, WebP 0.85 (không được thì JPEG 0.85)
export const MAX_UPLOAD = 5 * 1024 * 1024
export const ACCEPT = ['image/jpeg', 'image/png', 'image/webp']

export async function resizeImage(file: File, maxSide = 1600) {
  if (!ACCEPT.includes(file.type)) throw new Error('Chỉ nhận ảnh JPEG, PNG hoặc WebP')
  const bmp = await createImageBitmap(file)
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height))
  const w = Math.max(1, Math.round(bmp.width * scale))
  const h = Math.max(1, Math.round(bmp.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h)
  bmp.close()
  const toBlob = (type: string) => new Promise<Blob | null>((r) => canvas.toBlob(r, type, 0.85))
  let blob = await toBlob('image/webp')
  if (!blob || blob.type !== 'image/webp') blob = await toBlob('image/jpeg')
  if (!blob) throw new Error('Không xử lý được ảnh này')
  if (blob.size >= MAX_UPLOAD) throw new Error('Ảnh vẫn quá lớn (trên 5 MB) sau khi thu nhỏ')
  return { blob, width: w, height: h, name: `anh.${blob.type === 'image/webp' ? 'webp' : 'jpg'}` }
}
