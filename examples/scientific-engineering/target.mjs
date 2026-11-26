export function missing(values, present) {
  return values.filter(value => !present.includes(value));
}
