"use client";

import type { ReactNode } from "react";
import { cn } from "@/utils/cn";

type FormGridProps = {
  children: ReactNode;
  className?: string;
  /**
   * Geniş kapsayıcıda 2 kolona geçiş sınıfı — Tailwind taraması için
   * çağıran tarafta literal yazılır
   * (örn. `"@[40rem]/skill-detail:grid-cols-2"`).
   */
  twoColClass?: string;
};

/**
 * Form yerleşim ızgarası: dar alanda tek kolon, verilen kapsayıcı sınıfıyla
 * geniş alanda 2 kolon. Alanlar (Field/Input) çağıranda kalır.
 */
export function FormGrid({ children, className, twoColClass }: FormGridProps) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-x-10 gap-y-5",
        twoColClass,
        className,
      )}
    >
      {children}
    </div>
  );
}
