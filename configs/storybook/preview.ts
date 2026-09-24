import "../../src/style.css";
import { storybookPreview } from "@brain-bbqs/config/storybook-preview";

// Spread into an object literal: Storybook statically parses preview.ts and logs a "CSF Parsing
// error" for a bare identifier default export.
export default { ...storybookPreview };
