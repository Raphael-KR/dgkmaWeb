import { readFileSync, existsSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, sep } from "node:path";

// Validate source files only. Do not import the app, execute UI code or query services.
const root = fileURLToPath(new URL("../", import.meta.url));
const read = (name) =>
  JSON.parse(readFileSync(resolve(root, "shared/heritage", `${name}.json`), "utf8"));
const presidents = read("presidents");
const timeline = read("timeline");
const officers = read("officers");
const awards = read("awards");
const documents = read("documents");
const errors = [];

function expect(condition, field, expected, actual) {
  if (!condition) errors.push(`${field}: expected ${expected}; actual ${JSON.stringify(actual)}`);
}

function text(value, field) {
  expect(
    typeof value === "string" && value.trim().length > 0,
    field,
    "nonempty text",
    typeof value === "string" ? { length: value.length } : typeof value,
  );
}

function unique(values, field) {
  expect(new Set(values).size === values.length, field, "unique values", {
    total: values.length,
    unique: new Set(values).size,
  });
}

function positive(value, field) {
  expect(Number.isSafeInteger(value) && value > 0, field, "positive integer", value);
}

function dated(record, field) {
  text(record.title, `${field}.title`);
  const valid = typeof record.date === "string" && /^\d{4}(?:-\d{2}){0,2}$/.test(record.date);
  expect(valid, `${field}.date`, "YYYY[-MM[-DD]]", record.date);
  if (!valid) return;
  const [year, month = 1, day = 1] = record.date.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  expect(
    date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day,
    `${field}.date`,
    "calendar date",
    record.date,
  );
}

function ids(records, field) {
  const result = records.map((record) => record.id);
  unique(result, `${field}.id`);
  for (const id of result)
    expect(
      typeof id === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id),
      `${field}.id`,
      "lowercase ID",
      id,
    );
  return new Set(result);
}

function references(values = [], known, field) {
  unique(values, field);
  for (const id of values) expect(known.has(id), field, "existing ID", id);
}

function publicFile(src, prefix, field, extensions) {
  const relative = typeof src === "string" ? src.slice(prefix.length) : "";
  const safe =
    typeof src === "string" &&
    src.startsWith(prefix) &&
    relative.length > 0 &&
    !/[?#%\\]/.test(src) &&
    relative.split("/").every((part) => part && part !== "." && part !== "..") &&
    extensions.test(src);
  expect(safe, field, `local public file under ${prefix}`, {
    prefixMatches: typeof src === "string" && src.startsWith(prefix),
    type: typeof src,
  });
  if (!safe) return;
  const path = resolve(root, "client/public", src.slice(1));
  expect(existsSync(path), field, "file exists", { exists: existsSync(path) });
  if (existsSync(path))
    expect(
      realpathSync(path).startsWith(resolve(root, "client/public", prefix.slice(1)) + sep),
      field,
      "file within public directory",
      {
        contained: realpathSync(path).startsWith(
          resolve(root, "client/public", prefix.slice(1)) + sep,
        ),
      },
    );
}

const documentIds = ids(documents, "documents");
ids(timeline, "timeline");
ids(awards, "awards");
unique(
  documents.map((item) => item.src),
  "documents.src",
);

function albumReferences(values = [], field) {
  // The private catalogue is checked separately during data application.
  unique(values, field);
  ids(
    values.map((id) => ({ id })),
    field,
  );
}

for (const document of documents) {
  text(document.title, `document.${document.id}.title`);
  publicFile(
    document.src,
    "/documents/heritage/",
    `document.${document.id}.src`,
    /\.(?:pdf|txt|docx|hwpx|png|jpe?g)$/i,
  );
}
const terms = new Set(presidents.map((president) => president.term));
unique([...presidents.map((president) => president.term)], "presidents.term");
for (const president of presidents) {
  positive(president.term, "president.term");
  text(president.name, `president.${president.term}.name`);
  positive(president.startYear, `president.${president.term}.startYear`);
  expect(
    president.endYear >= president.startYear,
    `president.${president.term}.endYear`,
    `>= ${president.startYear}`,
    president.endYear,
  );
}
for (const entry of timeline) {
  const field = `timeline.${entry.id}`;
  dated(entry, field);
  albumReferences(entry.albumIds, `${field}.albumIds`);
  references(entry.documentIds, documentIds, `${field}.documentIds`);
  if (entry.presidentTerm !== undefined)
    expect(
      terms.has(entry.presidentTerm),
      `${field}.presidentTerm`,
      "existing term",
      entry.presidentTerm,
    );
  for (const source of entry.sources ?? []) {
    text(source.label, `${field}.source.label`);
    let url;
    try {
      url = new URL(source.url);
    } catch {
      /* Report the invalid source below. */
    }
    expect(
      url?.protocol === "https:" && !url.username && !url.password,
      `${field}.source.url`,
      "HTTPS URL without credentials",
      { protocol: url?.protocol, credentials: Boolean(url?.username || url?.password) },
    );
  }
  for (const donation of entry.donations ?? []) {
    positive(donation.amountWon, `${field}.donation.amountWon`);
    expect(
      ["기부", "기탁", "전달", "찬조 결의"].includes(donation.status),
      `${field}.donation.status`,
      "documented donation status",
      donation.status,
    );
  }
}
for (const award of awards) {
  dated(award, `award.${award.id}`);
  expect(
    ["동문회", "총동문회", "모교"].includes(award.issuer),
    `award.${award.id}.issuer`,
    "동문회/총동문회/모교",
    award.issuer,
  );
  text(award.recipient.name, `award.${award.id}.recipient.name`);
  albumReferences(award.albumIds, `award.${award.id}.albumIds`);
}

unique(
  officers.terms.map((term) => term.term),
  "officers.term",
);
expect(
  officers.terms.some((term) => term.term === officers.currentTerm),
  "officers.currentTerm",
  "existing officer term",
  officers.currentTerm,
);
for (const term of officers.terms) {
  expect(terms.has(term.term), "officers.term", "existing president term", term.term);
  ids(term.groups, `officers.${term.term}.groups`);
  for (const group of term.groups) {
    text(group.title, `officers.${term.term}.${group.id}.title`);
    unique(
      group.members.map((member) => `${member.title}:${member.name}`),
      `officers.${term.term}.${group.id}.members`,
    );
    for (const member of group.members) {
      text(member.name, `officers.${term.term}.member.name`);
      text(member.title, `officers.${term.term}.member.title`);
      if (member.photo)
        publicFile(
          member.photo,
          "/images/executives/",
          `officers.${term.term}.member.photo`,
          /\.(?:avif|webp|png|jpe?g)$/i,
        );
    }
  }
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    "Heritage content static checks passed:",
    JSON.stringify({
      presidents: presidents.length,
      timeline: timeline.length,
      officerTerms: officers.terms.length,
      donations: timeline.reduce((count, entry) => count + (entry.donations?.length ?? 0), 0),
      awards: awards.length,
      documents: documents.length,
    }),
  );
}
