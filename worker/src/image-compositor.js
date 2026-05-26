import {
  validateFaceCrop,
  validateMemeText,
  validateTemplateImage,
} from "./validator.js";

export async function compositeImage({
  templateImage,
  faceCrop,
  text,
  faceRegion,
  textOptions,
}) {
  validateTemplateImage(templateImage);
  validateFaceCrop(faceCrop);

  const safeText = validateMemeText(text);

  return {
    success: true,
    templateImage,
    faceCrop,
    text: safeText,
    faceRegion,
    textOptions,
  };
}