import Image from "next/image";
import type { CSSProperties } from "react";
import { veSneakerArtworkByDesign } from "@/lib/ve-sneakers";

type SneakerArtworkProps = {
  src?: string;
  alt?: string;
  design?: number;
  className?: string;
  imageClassName?: string;
  sizes?: string;
  style?: CSSProperties;
};

export default function SneakerArtwork({
  src,
  alt,
  design = 0,
  className = "",
  imageClassName = "",
  sizes = "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw",
  style,
}: SneakerArtworkProps) {
  const imageSrc = src ?? veSneakerArtworkByDesign(design, true).imageSrc;
  const isDataImage = imageSrc.startsWith("data:image/");

  return (
    <div className={`relative aspect-square ${className}`} style={style}>
      <Image
        src={imageSrc}
        alt={alt ?? "RUN&EARN virtual sneaker artwork"}
        fill
        sizes={sizes}
        unoptimized={isDataImage}
        className={`object-contain ${imageClassName}`}
      />
    </div>
  );
}
