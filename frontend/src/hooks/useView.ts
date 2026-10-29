import { useEffect, useState } from "react";

export type View = "fila" | "insights";

const read = (): View => (window.location.hash === "#insights" ? "insights" : "fila");

export function useView(): [View, (v: View) => void] {
  const [view, setView] = useState<View>(read);
  useEffect(() => {
    const onChange = () => setView(read());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return [view, (v) => { window.location.hash = v === "insights" ? "insights" : "fila"; }];
}
