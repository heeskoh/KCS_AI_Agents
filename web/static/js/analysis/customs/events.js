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
  });
}
