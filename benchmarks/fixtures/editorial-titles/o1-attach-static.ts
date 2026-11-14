// O1 control — o1-attach-animated.ts with every text animator removed, so the
// attach targets follow settled (static) bounds. The difference between the two
// renders isolates how animation excursions move attached layers.
import animated from "./o1-attach-animated.ts";

const control = { ...animated };
delete control.textAnimators;
export default control;
