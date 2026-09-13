"use client";

import { useTranslations } from "next-intl";
import { Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/** Execution silme onay diyaloğu. */
export function DeleteExecutionDialog({
  open,
  targetId,
  deleting,
  error,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  targetId: string | null;
  deleting: boolean;
  error: string | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (event: React.MouseEvent) => void;
}) {
  const t = useTranslations("JobExecutions");

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (deleting) return;
        onOpenChange(next);
      }}
    >
      <AlertDialogContent className="data-[size=default]:max-w-md data-[size=default]:sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogMedia className="bg-destructive/10 text-destructive dark:bg-destructive/20 dark:text-destructive">
            <Trash2 />
          </AlertDialogMedia>
          <AlertDialogTitle>{t("delete_this_execution")}</AlertDialogTitle>
          <AlertDialogDescription>
            {targetId ? (
              <>
                Execution{" "}
                <span className="break-all font-mono text-foreground">
                  {targetId}
                </span>{" "}
                will be permanently removed from history.
              </>
            ) : (
              <>This execution will be permanently removed from history.</>
            )}
            {error ? (
              <span className="mt-2 block text-destructive">{error}</span>
            ) : null}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel variant="outline" disabled={deleting}>
            {t("cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={deleting}
            onClick={(event) => void onConfirm(event)}
          >
            {deleting ? t("deleting") : t("delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
