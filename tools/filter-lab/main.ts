// 필터 실험실 — 개발용 페이지. `npm run dev` 뒤 http://localhost:4173/tools/filter-lab/index.html 에서
// 사진을 올리면 모든 필터를 **실제 엔진(bakePreviewLook)** 으로 입혀 나란히 보여줍니다. 룩을 다듬을 때
// 색을 눈으로 비교하고, 처리 시간을 재는 용도입니다. 빌드에는 포함되지 않습니다.
import { FILTERS } from "../../src/config/filters";
import { bakePreviewLook } from "../../src/lib/filterEngine";
import { applyLut3d, buildLut3d, LUT_SIZE } from "../../src/lib/filmGrade";

const filesInput = document.getElementById("files") as HTMLInputElement;
const widthInput = document.getElementById("width") as HTMLInputElement;
const workInput = document.getElementById("work") as HTMLInputElement;
const skinInput = document.getElementById("skin") as HTMLInputElement;
const onlyInput = document.getElementById("only") as HTMLInputElement;
const runButton = document.getElementById("run") as HTMLButtonElement;
const grid = document.getElementById("grid") as HTMLDivElement;
const timing = document.getElementById("timing") as HTMLSpanElement;

let sources: HTMLCanvasElement[] = [];

const loadFile = (file: File) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = URL.createObjectURL(file);
  });

async function prepare(files: FileList | File[], workWidth: number) {
  const result: HTMLCanvasElement[] = [];
  for (const file of Array.from(files)) {
    const image = await loadFile(file);
    const scale = Math.min(1, workWidth / image.naturalWidth);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.naturalWidth * scale);
    canvas.height = Math.round(image.naturalHeight * scale);
    const context = canvas.getContext("2d", { alpha: false })!;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    result.push(canvas);
  }
  return result;
}

const copyOf = (source: HTMLCanvasElement) => {
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  canvas.getContext("2d", { alpha: false })!.drawImage(source, 0, 0);
  return canvas;
};

async function run() {
  if (!sources.length) return;
  grid.innerHTML = "";
  grid.removeAttribute("data-done");
  grid.style.setProperty("--cell", `${widthInput.value}px`);
  const skin = Number(skinInput.value) || 0;
  const only = onlyInput.value.split(",").map((s) => s.trim()).filter(Boolean);
  const filters = only.length ? FILTERS.filter((f) => only.includes(f.key)) : FILTERS;
  const times: string[] = [];
  for (const filter of filters) {
    const row = document.createElement("section");
    row.className = "row";
    row.dataset.key = filter.key;
    const title = document.createElement("h2");
    title.innerHTML = `${filter.name} <small>${filter.key}</small>`;
    row.appendChild(title);
    const cells = document.createElement("div");
    cells.className = "cells";
    const started = performance.now();
    for (const source of sources) {
      const baked = bakePreviewLook(copyOf(source), filter, skin);
      cells.appendChild(baked);
    }
    const elapsed = (performance.now() - started) / sources.length;
    times.push(`${filter.key} ${elapsed.toFixed(0)}ms`);
    title.insertAdjacentHTML("beforeend", `<small>${elapsed.toFixed(0)} ms/장</small>`);
    row.appendChild(cells);
    grid.appendChild(row);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  timing.textContent = times.join(" · ");
  grid.dataset.done = "1";
}

filesInput.addEventListener("change", async () => {
  if (!filesInput.files?.length) return;
  sources = await prepare(filesInput.files, Number(workInput.value) || 700);
  void run();
});
runButton.addEventListener("click", async () => {
  if (filesInput.files?.length) sources = await prepare(filesInput.files, Number(workInput.value) || 700);
  void run();
});

/** 룩업표 적용 속도 — 미리보기(640×389)와 인화(1040×632) 크기에서 몇 ms 걸리는지. */
function benchmark() {
  const grade = FILTERS.find((f) => f.film)?.film;
  if (!grade) return {};
  const lut = buildLut3d(grade);
  const sizes: Record<string, number> = {};
  for (const [label, w, h] of [["preview", 640, 389], ["print", 1040, 632]] as const) {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < data.length; i += 1) data[i] = (i * 31) & 255;
    const t0 = performance.now();
    for (let k = 0; k < 5; k += 1) applyLut3d(data, lut);
    sizes[label] = (performance.now() - t0) / 5;
  }
  sizes.lutSize = LUT_SIZE;
  return sizes;
}

(window as unknown as { __lab: unknown }).__lab = { run, benchmark, prepare: (files: File[]) => prepare(files, Number(workInput.value) || 700).then((s) => { sources = s; }) };
