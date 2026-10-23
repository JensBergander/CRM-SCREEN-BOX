import { hintProps, ratingFor } from "@/lib/rating";
import { RatingHintView } from "./rating";

// Hinweis bei neuen Anfragen: deutlich bei 0 Sternen, dezent bei 1–2 Sternen, sonst nichts
export async function RatingHint({ companyId }: { companyId: number }) {
  const data = await ratingFor(companyId);
  if (!data || data.rating.stars === null || data.rating.stars > 2) return null;
  return <RatingHintView companyId={companyId} {...hintProps(data)} />;
}
