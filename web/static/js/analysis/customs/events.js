export function registerCustomsEvents(ctx){
  document.addEventListener("click", (event) => {
    const invNewJobBtn = event.target.closest("[data-inv-new-job]");
    if(invNewJobBtn){
      ctx.showInvNewJobForm = !ctx.showInvNewJobForm;
      if(ctx.showInvNewJobForm && !ctx.scenarioCompanies.length) ctx.loadScenarioCompanies();
      ctx.render("investigation");
      return;
    }

    const invSubmitBtn = event.target.closest("[data-inv-submit]");
    if(invSubmitBtn){
      const companyId = document.getElementById("invNewJobCompany")?.value;
      const templateId = document.getElementById("invNewJobTemplate")?.value;
      if(!companyId){ alert("조사 대상 업체를 선택하세요."); return; }
      const company = ctx.findCompanyById(companyId) || { company_id:companyId, company_name:companyId };
      ctx.createCanvasJob(company);
      ctx.activeCanvasCompanyId = companyId;
      const tpl = ctx.scenarioTemplateById(templateId || "customs-basic") || ctx.scenarioTemplateById("customs-basic");
      if(tpl){
        ctx.activeScenarioTemplateId = tpl.id;
        ctx.scenarioItems = tpl.items.map((item, i) => ctx.normalizeScenarioItem({...item, id:ctx.uid()}, i));
        ctx.selectedScenarioId = ctx.scenarioItems[0]?.id || null;
        ctx.companyScenarios[companyId] = ctx.scenarioItems.map(item => ({...item}));
        ctx.stepOutputs = {};
        ctx.stepStatuses = {};
        ctx.openedSteps = new Set();
        ctx.expandedResultStepId = null;
        ctx.patchCanvasJob(companyId, {
          status:{ label:"대기", tone:"wait", pct:0, done:0, total:ctx.scenarioItems.length },
          tab:"profile",
          scenarioChanged:false,
        });
      }
      ctx.loadCompanyRunArchive(companyId);
      ctx.scenarioInitialized = false;
      ctx.scenarioLoadedForCompany = null;
      ctx.showInvNewJobForm = false;
      // 탭 이동 없이 카드 등록 후 목록 유지
      ctx.saveCanvasState();
      ctx.render("investigation");
      return;
    }

    const invToggleArchive = event.target.closest("[data-inv-toggle-archive]");
    if(invToggleArchive){
      ctx.invArchiveOpen = !ctx.invArchiveOpen;
      ctx.render("investigation");
      return;
    }

    const invArchiveJobBtn = event.target.closest("[data-inv-archive-job]");
    if(invArchiveJobBtn){
      const companyId = invArchiveJobBtn.dataset.invArchiveJob;
      ctx.archiveCanvasJob(companyId);
      ctx.invArchiveOpen = true;
      ctx.render("investigation");
      return;
    }

    const invRestoreJobBtn = event.target.closest("[data-inv-restore-job]");
    if(invRestoreJobBtn){
      const companyId = invRestoreJobBtn.dataset.invRestoreJob;
      ctx.restoreRunArchiveToWorkspace(companyId, { tab:"profile" });
      ctx.invArchiveOpen = false;
      ctx.investigationTab = "ongoing";
      ctx.render("investigation");
      return;
    }

    const invRemoveJobBtn = event.target.closest("[data-inv-remove-job]");
    if(invRemoveJobBtn){
      const companyId = invRemoveJobBtn.dataset.invRemoveJob;
      const job = ctx.canvasJobs().find(item => item.companyId === companyId);
      const name = job?.companyName || job?.company || companyId;
      if(!confirm(`${name} 진행작업을 내 목록에서 삭제하시겠습니까?`)) return;
      ctx.removeCanvasJobForCurrentUser(companyId);
      ctx.render("investigation");
      return;
    }

    const invCompanyCard = event.target.closest("[data-inv-company]");
    if(invCompanyCard && !event.target.closest("[data-inv-archive-job],[data-inv-restore-job],[data-inv-remove-job]")){
      const companyId = invCompanyCard.dataset.invCompany;
      const targetTab = invCompanyCard.dataset.invTab || "profile";
      ctx.activeCanvasCompanyId = companyId;
      ctx.investigationTab = targetTab;
      ctx.scenarioInitialized = false;
      ctx.scenarioLoadedForCompany = null;
      ctx.loadCompanyRunArchive(companyId);
      ctx.saveCanvasState();
      ctx.render("investigation");
      return;
    }

    const investigationSelectBtn = event.target.closest("[data-investigation-select]");
    if(investigationSelectBtn){
      const companyId = investigationSelectBtn.dataset.investigationSelect;
      ctx.activeCanvasCompanyId = companyId;
      ctx.investigationTab = "profile";
      ctx.scenarioInitialized = false;
      ctx.scenarioLoadedForCompany = null;
      ctx.loadCompanyRunArchive(companyId);
      ctx.saveCanvasState();
      ctx.render("investigation");
      return;
    }

    const investigationTabButton = event.target.closest("[data-investigation-tab]");
    if(investigationTabButton){
      const companyId = investigationTabButton.dataset.canvasCompany;
      if(companyId){
        ctx.activeCanvasCompanyId = companyId;
        ctx.scenarioInitialized = false;
        ctx.scenarioLoadedForCompany = null;
        ctx.loadCompanyRunArchive(companyId);
        ctx.showScenarioCompanyPicker = false;
        ctx.saveCanvasState();
      }
      ctx.investigationTab = investigationTabButton.dataset.investigationTab;
      ctx.render("investigation");
      return;
    }

    /* ── 공통 워크벤치 (ns="canvas") — 관세조사 시나리오 탭 ──────────── */

    // 단계 선택
    const canvasStepSelect = event.target.closest("[data-canvas-step-select]");
    if(canvasStepSelect && !event.target.closest("[data-canvas-step-up],[data-canvas-step-down]")){
      ctx.selectedScenarioId = canvasStepSelect.dataset.canvasStepSelect;
      ctx.syncScenarioEditor?.();
      ctx.renderScenarioList?.();
      return;
    }

    // 단계 위로
    const canvasStepUp = event.target.closest("[data-canvas-step-up]");
    if(canvasStepUp){
      const id = canvasStepUp.dataset.canvasStepUp;
      const i = ctx.scenarioItems.findIndex(s => s.id === id);
      if(i > 0){ [ctx.scenarioItems[i-1], ctx.scenarioItems[i]] = [ctx.scenarioItems[i], ctx.scenarioItems[i-1]]; }
      ctx.saveCompanyScenario?.();
      ctx.renderScenarioList?.();
      return;
    }

    // 단계 아래로
    const canvasStepDown = event.target.closest("[data-canvas-step-down]");
    if(canvasStepDown){
      const id = canvasStepDown.dataset.canvasStepDown;
      const i = ctx.scenarioItems.findIndex(s => s.id === id);
      if(i < ctx.scenarioItems.length-1){ [ctx.scenarioItems[i], ctx.scenarioItems[i+1]] = [ctx.scenarioItems[i+1], ctx.scenarioItems[i]]; }
      ctx.saveCompanyScenario?.();
      ctx.renderScenarioList?.();
      return;
    }

    // 단계 삭제
    const canvasStepDelete = event.target.closest("[data-canvas-step-delete]");
    if(canvasStepDelete){
      ctx.selectedScenarioId = canvasStepDelete.dataset.canvasStepDelete;
      ctx.deleteSelectedScenario?.();
      return;
    }

    // 단계 추가
    const canvasStepAdd = event.target.closest("[data-canvas-step-add]");
    if(canvasStepAdd){
      ctx.addScenarioItem?.();
      return;
    }

    // 템플릿 적용
    const canvasTemplateApply = event.target.closest("[data-canvas-template-apply]");
    if(canvasTemplateApply){
      ctx.applySelectedScenarioTemplate?.();
      return;
    }

    // 전체 실행 / 결과 지우기 / 재실행
    const canvasRunStep = event.target.closest("[data-canvas-run-step]");
    if(canvasRunStep){
      const val = canvasRunStep.dataset.canvasRunStep;
      const stepId = val.split(":")[1];
      if(stepId === "clear"){ ctx.clearScenarioResults?.(); }
      else { ctx.runScenarioWorkflow?.(); }
      return;
    }
    const canvasRerunStep = event.target.closest("[data-canvas-rerun-step]");
    if(canvasRerunStep){
      const val = canvasRerunStep.dataset.canvasRerunStep;
      const stepId = val.split(":")[1];
      if(stepId === "clear"){ ctx.clearScenarioResults?.(); }
      else { ctx.runScenarioWorkflow?.(); }
      return;
    }

    // 결과 토글
    const canvasToggleResult = event.target.closest("[data-canvas-toggle-result]");
    if(canvasToggleResult){
      const id = canvasToggleResult.dataset.canvasToggleResult;
      if(ctx.openedSteps.has(id)) ctx.openedSteps.delete(id);
      else ctx.openedSteps.add(id);
      ctx.renderScenarioSteps?.();
      return;
    }

    // 권한 요청
    const canvasPermReq = event.target.closest("[data-canvas-step-request-perm]");
    if(canvasPermReq){
      ctx.requestPermission?.(canvasPermReq.dataset.canvasStepRequestPerm);
      ctx.render("investigation");
      return;
    }

  });

  /* ── 드래그 앤 드롭 (관세조사 시나리오 단계 순서 변경) ── */
  document.addEventListener("dragstart", event => {
    const chip = event.target.closest("[data-canvas-step-drag-id]");
    if(chip) event.dataTransfer.setData("text/plain", chip.dataset.canvasStepDragId);
  });
  document.addEventListener("dragover", event => {
    if(event.target.closest("[data-canvas-step-drag-id]")) event.preventDefault();
  });
  document.addEventListener("drop", event => {
    const chip = event.target.closest("[data-canvas-step-drag-id]");
    if(!chip) return;
    event.preventDefault();
    const fromId = event.dataTransfer.getData("text/plain");
    const toId   = chip.dataset.canvasStepDragId;
    if(!fromId || fromId === toId) return;
    const from = ctx.scenarioItems.findIndex(s => s.id === fromId);
    const to   = ctx.scenarioItems.findIndex(s => s.id === toId);
    if(from < 0 || to < 0) return;
    const [moved] = ctx.scenarioItems.splice(from, 1);
    ctx.scenarioItems.splice(to, 0, moved);
    ctx.saveCompanyScenario?.();
    ctx.renderScenarioList?.();
  });
}
