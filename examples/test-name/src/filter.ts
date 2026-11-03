export function filterSlow(items: { speed: number }[]) {
  return items.filter((item) => item.speed > 3);
}

test("works", () => {
  expect(filterSlow([])).toEqual([]);
});

test("should drop slow planes", () => {
  expect(filterSlow([{ speed: 1 }])).toEqual([]);
});
