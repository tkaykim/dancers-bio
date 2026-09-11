import Image from "next/image";
import { isProjectImage } from "@/lib/storage/project-file";
import { serverT } from "@/lib/i18n/server";
import project from "@/lib/i18n/messages/project";

export type ProjectMediaAttachment = {
  id: string;
  file_name: string;
  mime_type: string | null;
  url: string;
};

export async function ProjectMediaGallery({
  attachments,
}: {
  attachments: ProjectMediaAttachment[];
}) {
  if (attachments.length === 0) return null;
  const t = await serverT(project);

  return (
    <section
      aria-label={t("media.section")}
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
                aria-label={t("media.open_original", { name: attachment.file_name })}
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
                {t("media.video_unsupported")}
              </video>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
