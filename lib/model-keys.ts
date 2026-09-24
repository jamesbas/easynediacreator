const VARIANT_SEPARATOR = "::";

export function modelVariantKey(logicalKey: string, modelType: string) {
  return `${logicalKey}${VARIANT_SEPARATOR}${modelType}`;
}

export function logicalModelKey(modelKey: string) {
  return modelKey.split(VARIANT_SEPARATOR, 1)[0];
}
