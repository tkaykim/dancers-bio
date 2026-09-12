import { readFile, writeFile, mkdir } from "node:fs/promises";
import { extractIntake, imageBlock } from "./project-intake-worker.mjs";
import { renderDeck } from "./intake-studio.mjs";
const paths = process.argv.slice(2).filter((p) => !p.startsWith("--"));
if (!paths.length) throw new Error("Pass screenshot paths");
const images = await Promise.all(
  paths.map(async (p) => imageBlock(await readFile(p))),
);
const result = await extractIntake(
  {
    source_raw: "",
    hide_names: true,
    private_terms: (process.env.DEETZ_INTAKE_PRIVATE_TERMS || "")
      .split(",")
      .filter(Boolean),
    languages: ["ko", "en"],
    operator_notes:
      "여성은 모집 강사의 성별입니다. 회사·그룹명은 비공개. 지원 한마디에 경력·출강 여부·현재 및 희망 레슨비(단위 포함)·포트폴리오·가능 시간을 받습니다.",
  },
  images,
  ["kpop", "choreography"],
);
await mkdir("scripts/out", { recursive: true });
await writeFile(
  "scripts/out/intake-ocr-result.json",
  JSON.stringify(result, null, 2),
);
console.log(
  JSON.stringify({
    title: result.project.title,
    languages: result.decks.map((d) => d.language),
    missing: result.missing,
    companyHidden: true,
  }),
);
if (process.argv.includes("--render"))
  for (const deck of result.decks) {
    const job = await renderDeck(deck);
    console.log(
      JSON.stringify({
        language: deck.language,
        id: job.id,
        files: job.renderedImages.light,
      }),
    );
  }
