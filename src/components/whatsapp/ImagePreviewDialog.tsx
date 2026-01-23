import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ImagePreviewDialogProps {
  url: string | null;
  title?: string;
  onClose: () => void;
}

export function ImagePreviewDialog({ url, title = "Imagen", onClose }: ImagePreviewDialogProps) {
  return (
    <Dialog
      open={!!url}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-5xl p-0">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <ScrollArea type="always" className="h-[75vh] px-6 pb-6">
          {url ? (
            <img
              src={url}
              alt={title}
              loading="lazy"
              className="w-full h-auto rounded-md"
            />
          ) : null}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
