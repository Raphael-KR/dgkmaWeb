type DifferencePart = { text: string; changed: boolean };

function append(parts: DifferencePart[], text: string, changed: boolean) {
  const previous = parts.at(-1);
  if (previous?.changed === changed) previous.text += text;
  else parts.push({ text, changed });
}

// 공통 글자를 정렬해 삽입·삭제 뒤의 같은 글자까지 강조되는 것을 피한다.
export function compareRegistrationValues(applicant: string, registry: string) {
  const left = Array.from(applicant);
  const right = Array.from(registry);
  const lengths = Array.from({ length: left.length + 1 }, () => new Uint32Array(right.length + 1));
  for (let i = left.length - 1; i >= 0; i--) {
    for (let j = right.length - 1; j >= 0; j--) {
      lengths[i][j] =
        left[i] === right[j]
          ? lengths[i + 1][j + 1] + 1
          : Math.max(lengths[i + 1][j], lengths[i][j + 1]);
    }
  }
  const applicantParts: DifferencePart[] = [];
  const registryParts: DifferencePart[] = [];
  let i = 0;
  let j = 0;
  while (i < left.length || j < right.length) {
    if (i < left.length && j < right.length && left[i] === right[j]) {
      append(applicantParts, left[i++], false);
      append(registryParts, right[j++], false);
    } else if (j === right.length || (i < left.length && lengths[i + 1][j] >= lengths[i][j + 1])) {
      append(applicantParts, left[i++], true);
    } else {
      append(registryParts, right[j++], true);
    }
  }
  return { applicantParts, registryParts };
}
