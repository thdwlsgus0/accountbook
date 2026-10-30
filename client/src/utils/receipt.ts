import { api } from '../api/client';

// 휴대폰 카메라 사진은 한 장에 수 MB라 그대로 올리면 느리고 서버 한도(3MB)에 걸린다.
// 영수증 글자를 읽기엔 긴 변 1600px JPEG면 충분하므로, 업로드 전에 캔버스로 줄여서 보낸다.
const MAX_SIDE = 1600;
const JPEG_QUALITY = 0.8;

export async function compressImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas not supported');
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('압축 실패'))), 'image/jpeg', JPEG_QUALITY);
  });
}

export async function uploadReceipt(householdId: number, transactionId: number, file: File) {
  const blob = await compressImage(file);
  await api.put(`/households/${householdId}/transactions/${transactionId}/receipt`, blob, {
    headers: { 'Content-Type': 'image/jpeg' },
  });
}

export async function deleteReceipt(householdId: number, transactionId: number) {
  await api.delete(`/households/${householdId}/transactions/${transactionId}/receipt`);
}

// <img src>로는 Authorization 헤더를 못 보내므로 Blob으로 받아 object URL을 만든다.
// 다 쓰고 나면 호출한 쪽에서 URL.revokeObjectURL로 해제해야 한다.
export async function fetchReceiptUrl(householdId: number, transactionId: number): Promise<string> {
  const res = await api.get<Blob>(`/households/${householdId}/transactions/${transactionId}/receipt`, {
    responseType: 'blob',
  });
  return URL.createObjectURL(res.data);
}
