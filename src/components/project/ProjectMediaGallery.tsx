import Image from "next/image";
import { isProjectImage } from "@/lib/storage/project-file";

export type ProjectMediaAttachment = {
  id: string;
  file_name: string;
  mime_type: string | null;
  url: string;
};

export function ProjectMediaGallery({
  attachments,
}: {
  attachments: ProjectMediaAttachment[];
}) {
  if (attachments.length === 0) return null;

  return (
    <section
      aria-label="공고 사진과 영상"
      data-testid="project-media-gallery"
    >
      <ul className="flex flex-col gap-4">
        {attachments.map((attachment, index) => (
          <li key={attachment.id} className="overflow-hidden rounded-2xl bg-card">
            {isProjectImage(attachment.mime_type) ? (
              <a
                href={attachment.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${attachment.file_name} 원본 이미지 열기`}
                className="block bg-secondary/30"
              >
                <Image
                  src={attachment.url}
                  alt={attachment.file_name}
                  width={1200}
                  height={1500}
                  loading={index === 0 ? "eager" : "lazy"}
                  sizes="(max-width: 448px) 100vw, 448px"
                  className="h-auto max-h-[75vh] w-full object-contain"
                />
              </a>
            ) : (
              <video
                controls
                playsInline
                preload="metadata"
                className="max-h-[75vh] w-full bg-black object-contain"
                aria-label={attachment.file_name}
              >
                <source
                  src={attachment.url}
                  type={attachment.mime_type ?? undefined}
                />
                이 브라우저에서는 영상을 재생할 수 없습니다.
              </video>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
