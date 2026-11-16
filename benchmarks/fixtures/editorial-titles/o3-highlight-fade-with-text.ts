// ET5a — the O3 tag with `fadeWithText: true` on its highlight: the bar's
// alpha follows the tag's line-animator opacity, so it fades out with the
// text (frames 62–70) instead of staying until the out point.
import { highlightFade } from "./o3-highlight-fade.ts";

export default highlightFade(true);
