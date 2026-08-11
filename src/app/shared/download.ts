/** Hands a generated file to the browser; mirrors the CSV export's object-URL choreography. */
export function offerDownload(documentRef: Document, fileName: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = documentRef.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  // Some browsers abort the transfer when the object URL is revoked in the same task.
  setTimeout(() => URL.revokeObjectURL(url));
}
