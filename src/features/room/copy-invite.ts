import { useAppStore } from '../../stores/app-store';
export async function copyInvite(code: string) {
  const { notify } = useAppStore.getState();
  try {
    await navigator.clipboard.writeText(`${location.origin}/room/${code}`);
    notify('邀請連結已複製，傳給朋友吧！');
  } catch {
    notify(`請複製網址列的邀請連結，或分享房間碼 ${code}`);
  }
}
