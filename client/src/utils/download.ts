import { AxiosResponse } from 'axios';

// 서버가 Content-Disposition으로 내려준 파일명을 쓰고, 없으면 fallback을 쓴다.
// Blob 응답을 임시 <a download>로 클릭해서 내려받는다 (axios는 쿠키가 아니라
// Authorization 헤더로 인증하므로, 그냥 <a href>로는 토큰을 못 보내 403이 난다).
export function triggerDownload(response: AxiosResponse<Blob>, fallbackFilename: string) {
  const disposition = response.headers['content-disposition'] as string | undefined;
  const match = disposition ? /filename="?([^"]+)"?/.exec(disposition) : null;
  const filename = match ? match[1] : fallbackFilename;

  const url = URL.createObjectURL(response.data);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
