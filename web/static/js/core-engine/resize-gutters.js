/* ── 프레임 동적 크기 조절(리사이즈 거터) — 공용 코어 ────────────────────
   어느 화면이든 .resize-gutter 를 두 패널 사이에 넣으면 경계를 끌어
   실시간으로 크기를 바꿀 수 있다. 가로=.x(col-resize), 세로=.y(row-resize).
   기본은 거터의 '이전' 패널을 조절하고, data-resize-target="next" 면 '다음' 패널을 조절한다.
   document 위임 방식이라 import 부수효과만으로 전 사이트(포털·조사관·수사관·보고서)에서 동작. */
(function initResizeGutters(){
  let drag = null;
  const onMove = (e) => {
    if(!drag) return;
    const cur = drag.dir === "x" ? e.clientX : e.clientY;
    const delta = (cur - drag.startPos) * (drag.target === "next" ? -1 : 1);
    const size = Math.max(drag.min, drag.startSize + delta);
    drag.el.style.flex = "0 0 auto";
    drag.el.style[drag.dir === "x" ? "width" : "height"] = size + "px";
  };
  const stop = () => {
    if(!drag) return;
    drag = null;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", stop);
  };
  document.addEventListener("mousedown", (e) => {
    const gutter = e.target?.closest?.(".resize-gutter");
    if(!gutter) return;
    const dir = gutter.classList.contains("y") ? "y" : "x";
    const target = gutter.dataset.resizeTarget === "next" ? "next" : "prev";
    const el = target === "next" ? gutter.nextElementSibling : gutter.previousElementSibling;
    if(!el) return;
    e.preventDefault();
    const rect = el.getBoundingClientRect();
    drag = {
      dir, target, el,
      startPos: dir === "x" ? e.clientX : e.clientY,
      startSize: dir === "x" ? rect.width : rect.height,
      min: Number(gutter.dataset.resizeMin) || 120,
    };
    document.body.style.cursor = dir === "x" ? "col-resize" : "row-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", stop);
  });
})();
