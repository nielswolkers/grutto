export function notificationDestination(notification: { type: string; file_id?: string | null; message: string }) {
  if (notification.file_id) return `/materialen/preview/${notification.file_id}`;
  if (notification.type === 'studyset_share') {
    const match = notification.message.match(/\/studieset\/([0-9a-f]{8}-[0-9a-f-]{27,})/i);
    if (match) return `/studieset/${match[1]}`;
  }
  return null;
}