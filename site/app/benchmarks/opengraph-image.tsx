import { routeTitles } from "../route-titles";
import { wordcellSocialImage } from "../social-image";

export { contentType, size } from "../social-image";
export const alt = routeTitles.benchmarks.title;

export default function OpengraphImage() {
  return wordcellSocialImage(routeTitles.benchmarks.card);
}
