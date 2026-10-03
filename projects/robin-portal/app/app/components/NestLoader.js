// The nest loader for a loading state. `block` centres it in the page; otherwise it sits inline where it is put.
import { loaderHtml } from "../../lib/loader.js";

export default function NestLoader({ size = 160, label = "Loading", block = true }) {
  return <div className={block ? "nest-block" : undefined} dangerouslySetInnerHTML={{ __html: loaderHtml({ size, label }) }} />;
}
