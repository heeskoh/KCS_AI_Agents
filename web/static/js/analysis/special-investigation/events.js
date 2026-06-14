export function registerSpecialInvestigationEvents(ctx){
  document.addEventListener("click", (event) => {
    const drugTab = event.target.closest("[data-drug-tab]");
    if(drugTab){
      ctx.drugInvTab = drugTab.dataset.drugTab;
      ctx.saveCanvasState();
      ctx.renderSpecialInvestigation();
      return;
    }

    const drugSubTab = event.target.closest("[data-drug-subtab]");
    if(drugSubTab){
      const [group, tab] = drugSubTab.dataset.drugSubtab.split(":");
      if(group === "data") ctx.drugDataSubTab = tab;
      if(group === "network") ctx.drugNetworkSubTab = tab;
      if(group === "forensic") ctx.drugForensicSubTab = tab;
      if(group === "report") ctx.drugReportSubTab = tab;
      ctx.saveCanvasState();
      ctx.renderSpecialInvestigation();
      return;
    }

    const drugStepSelect = event.target.closest("[data-drug-step-select]");
    if(drugStepSelect && !event.target.closest("[data-drug-step-up],[data-drug-step-down]")){
      ctx.activeDrugStepId = drugStepSelect.dataset.drugStepSelect;
      ctx.renderSpecialInvestigation(); return;
    }

    const drugStepUp = event.target.closest("[data-drug-step-up]");
    if(drugStepUp){
      const aCase = ctx.activeDrugCase(); if(!aCase) return;
      const steps = ctx.activeDrugCaseSteps();
      const idx = steps.findIndex(s => s.id === drugStepUp.dataset.drugStepUp);
      if(idx > 0){ [steps[idx-1], steps[idx]] = [steps[idx], steps[idx-1]]; }
      ctx.saveCanvasState(); ctx.renderSpecialInvestigation(); return;
    }

    const drugStepDown = event.target.closest("[data-drug-step-down]");
    if(drugStepDown){
      const aCase = ctx.activeDrugCase(); if(!aCase) return;
      const steps = ctx.activeDrugCaseSteps();
      const idx = steps.findIndex(s => s.id === drugStepDown.dataset.drugStepDown);
      if(idx < steps.length-1){ [steps[idx], steps[idx+1]] = [steps[idx+1], steps[idx]]; }
      ctx.saveCanvasState(); ctx.renderSpecialInvestigation(); return;
    }

    const drugStepDelete = event.target.closest("[data-drug-step-delete]");
    if(drugStepDelete){
      const aCase = ctx.activeDrugCase(); if(!aCase) return;
      const id = drugStepDelete.dataset.drugStepDelete;
      aCase.giSteps = ctx.activeDrugCaseSteps().filter(s => s.id !== id);
      if(ctx.activeDrugStepId === id) ctx.activeDrugStepId = aCase.giSteps[0]?.id || null;
      ctx.saveCanvasState(); ctx.renderSpecialInvestigation(); return;
    }

    /* ── 마약수사 템플릿 적용 ── */
    const drugTemplateApply = event.target.closest("[data-drug-template-apply]");
    if(drugTemplateApply){
      const sel = document.getElementById("drugWbTemplateSelect");
      const tplId = sel?.value;
      const aCase = ctx.activeDrugCase();
      if(aCase && tplId && ctx.DRUG_SCENARIO_STEPS?.[tplId]){
        const defaults = ctx.DRUG_SCENARIO_STEPS[tplId];
        aCase.giSteps    = defaults.map((s, i) => ctx.normalizeGiScenarioStep({
          ...s,
          id:`drs_${ctx.uid()}`,
          targetType: aCase.targetType || "person",
          target_type: aCase.targetType || "person",
        }, i));
        aCase.stepStates = {}; aCase.stepResults = {}; aCase.stepExpanded = {};
        ctx.activeDrugStepId = aCase.giSteps[0]?.id || null;
        ctx.saveCanvasState(); ctx.renderSpecialInvestigation();
      }
      return;
    }

    /* ── 마약수사 권한 요청 ── */
    const drugPermReq = event.target.closest("[data-drug-step-request-perm]");
    if(drugPermReq){
      ctx.requestPermissions?.([drugPermReq.dataset.drugStepRequestPerm]);
      ctx.renderSpecialInvestigation();
      return;
    }

    const drugStepAdd = event.target.closest("[data-drug-step-add]");
    if(drugStepAdd){
      const aCase = ctx.activeDrugCase(); if(!aCase) return;
      const sel = document.getElementById("drugWbAddSource");
      const key = sel?.value; if(!key) return;
      if(!aCase.giSteps) ctx.activeDrugCaseSteps();
      const src = ctx.GI_STEP_SOURCES.find(s => s.key === key) || ctx.GI_STEP_SOURCES[0];
      aCase.giSteps.push(ctx.normalizeGiScenarioStep({
        ...src, id:`drs_${ctx.uid()}`,
        sourceKey: src.sourceKey,
        targetType: aCase.targetType || "person",
        target_type: aCase.targetType || "person",
        behaviors: ctx.sourceDefaultBehaviors(src.sourceKey),
        instruction: ctx.sourceDefaultInstruction(src.sourceKey, aCase.targetType||"person"),
      }, aCase.giSteps.length));
      ctx.activeDrugStepId = aCase.giSteps[aCase.giSteps.length-1].id;
      ctx.saveCanvasState(); ctx.renderSpecialInvestigation(); return;
    }

    const drugRunStep = event.target.closest("[data-drug-run-step]");
    if(drugRunStep){
      const [caseId, stepId] = drugRunStep.dataset.drugRunStep.split(":");
      const aCase = ctx.activeDrugCase(); if(!aCase) return;
      if(stepId === "clear"){
        aCase.stepStates  = {}; aCase.stepResults = {}; aCase.stepExpanded = {};
        ctx.saveCanvasState(); ctx.renderSpecialInvestigation(); return;
      }
      if(!aCase.stepStates) aCase.stepStates = {};
      if(!aCase.stepResults) aCase.stepResults = {};
      const steps = ctx.activeDrugCaseSteps();
      const toRun = stepId === "all" ? steps : steps.filter(s => s.id === stepId);
      ctx.drugStreamSteps(aCase, toRun);
      return;
    }

    const drugToggleResult = event.target.closest("[data-drug-toggle-result]");
    if(drugToggleResult){
      const aCase = ctx.activeDrugCase(); if(!aCase) return;
      if(!aCase.stepExpanded) aCase.stepExpanded = {};
      const id = drugToggleResult.dataset.drugToggleResult;
      aCase.stepExpanded[id] = !aCase.stepExpanded[id];
      ctx.renderSpecialInvestigation(); return;
    }

    const drugAccBtn = event.target.closest("[data-drug-acc]");
    if(drugAccBtn){
      const key = drugAccBtn.dataset.drugAcc;
      ctx.drugAccordionOpen[key] = !ctx.drugAccordionOpen[key];
      ctx.renderSpecialInvestigation();
      return;
    }

    const drugRemoveCase = event.target.closest("[data-drug-remove-case]");
    if(drugRemoveCase){
      event.stopPropagation();
      const caseId = drugRemoveCase.dataset.drugRemoveCase;
      const idx = ctx.defaultDrugInvCases.findIndex(c => c.caseId === caseId);
      if(idx !== -1) ctx.defaultDrugInvCases.splice(idx, 1);
      if(ctx.activeDrugCaseId === caseId){ ctx.activeDrugCaseId = null; ctx.drugInvTab = "ongoing"; }
      ctx.saveCanvasState(); ctx.renderSpecialInvestigation(); return;
    }

    const drugArchiveCase = event.target.closest("[data-drug-archive-case]");
    if(drugArchiveCase){
      event.stopPropagation();
      const caseId = drugArchiveCase.dataset.drugArchiveCase;
      const idx = ctx.defaultDrugInvCases.findIndex(c => c.caseId === caseId);
      const c = idx !== -1 ? ctx.defaultDrugInvCases.splice(idx, 1)[0] : null;
      if(c){ ctx.archivedDrugCases.unshift({...c, archivedAt: new Date().toLocaleString()}); }
      if(ctx.activeDrugCaseId === caseId){ ctx.activeDrugCaseId = null; ctx.drugInvTab = "ongoing"; }
      ctx.saveCanvasState(); ctx.renderSpecialInvestigation(); return;
    }

    const drugRestoreCase = event.target.closest("[data-drug-restore-case]");
    if(drugRestoreCase){
      event.stopPropagation();
      const caseId = drugRestoreCase.dataset.drugRestoreCase;
      const idx = ctx.archivedDrugCases.findIndex(c => c.caseId === caseId);
      if(idx !== -1){ ctx.defaultDrugInvCases.push(ctx.archivedDrugCases.splice(idx, 1)[0]); }
      ctx.saveCanvasState(); ctx.renderSpecialInvestigation(); return;
    }

    const drugToggleArchive = event.target.closest("[data-drug-toggle-archive]");
    if(drugToggleArchive){
      ctx.drugArchiveOpen = !ctx.drugArchiveOpen;
      ctx.renderSpecialInvestigation(); return;
    }

    const drugCaseBtn = event.target.closest("[data-drug-case]");
    if(drugCaseBtn){
      ctx.activeDrugCaseId = drugCaseBtn.dataset.drugCase;
      const selectedDrugCase = ctx.activeDrugCase();
      ctx.resetDrugCaseSubTabs(selectedDrugCase);
      ctx.drugInvTab = "profile";
      ctx.saveCanvasState();
      ctx.renderSpecialInvestigation();
      return;
    }

    const drugRegTypeBtn = event.target.closest("[data-drug-reg-type]");
    if(drugRegTypeBtn){
      ctx.drugRegTargetType = drugRegTypeBtn.dataset.drugRegType;
      if(ctx.drugRegTargetType === "person") ctx.loadRiskPersons();
      if(ctx.drugRegTargetType === "company" && !ctx.scenarioCompanies.length) ctx.loadScenarioCompanies();
      ctx.renderSpecialInvestigation();
      return;
    }

    const drugRegToggle = event.target.closest("[data-drug-reg-toggle]");
    if(drugRegToggle){
      ctx.showDrugNewCaseForm = !ctx.showDrugNewCaseForm;
      if(ctx.showDrugNewCaseForm){
        if(!ctx.scenarioCompanies.length) ctx.loadScenarioCompanies();
      }
      ctx.renderSpecialInvestigation();
      return;
    }

    const drugRegSubmit = event.target.closest("[data-drug-reg-submit]");
    if(drugRegSubmit){
      const selectedId = document.getElementById("drugRegTargetSelect")?.value || "";
      if(!selectedId){ alert("수사 대상을 선택하세요."); return; }
      // 현재 페이지 도메인(lawsearch=마약 / fxsearch=외환)에 맞춰 사건을 등록한다.
      const domain = ctx.getCurrentPage?.() === "fxsearch" ? "fxsearch" : "lawsearch";
      const isFx = domain === "fxsearch";
      const defaultTypeId = isFx ? "f1" : "d1";
      const invTypeId = document.getElementById("drugRegType")?.value || defaultTypeId;

      let targetName, extraFields = {};
      if(ctx.drugRegTargetType === "company"){
        const co = ctx.findCompanyById(selectedId) || ctx.scenarioCompanies.find(c => c.company_id === selectedId);
        targetName = co?.company_name || selectedId;
        extraFields = { companyId: selectedId, targetType:"company" };
      } else {
        const person = ctx.riskPersonById(selectedId);
        targetName = person?.name || selectedId;
        extraFields = { targetType:"person", personId: selectedId, nationality: person?.nationality || "미상" };
      }

      const prefix = isFx ? "FX" : "DRUG";
      const sameDomainCount = ctx.defaultDrugInvCases.filter(c => (c.domain || "lawsearch") === domain).length;
      const autoId = prefix + "-" + new Date().getFullYear() + "-" + String(sameDomainCount + 1).padStart(3,"0");
      const userId = ctx.currentUserId || "u01";
      const newCase = {
        caseId: autoId,
        targetName, invTypeId, domain,
        ...extraFields,
        team:        isFx ? "외환수사 전담팀" : "마약수사 전담팀",
        investigator: ctx.currentUser().name,
        ownerUserId: userId, assignees: [userId],
        updated: "방금",
        status: { label:"대기", tone:"wait", done:0, total:6, pct:0 },
      };
      ctx.defaultDrugInvCases.push(newCase);
      ctx.activeDrugCaseId = newCase.caseId;
      ctx.resetDrugCaseSubTabs(newCase);
      ctx.drugInvTab = "profile";
      ctx.showDrugNewCaseForm = false;
      ctx.drugRegTargetType   = "company";
      ctx.saveCanvasState();
      ctx.renderSpecialInvestigation();
      return;
    }

    const drugNetworkBtn = event.target.closest("[data-drug-network-target]");
    if(drugNetworkBtn){
      try{ ctx.drugInvSelectedTarget = JSON.parse(drugNetworkBtn.dataset.drugNetworkTarget); }catch(e){}
      ctx.drugInvTab = "network";
      ctx.renderSpecialInvestigation();
      return;
    }

    const slangDecodeBtn = event.target.closest("[data-slang-decode]");
    if(slangDecodeBtn){
      const input = document.getElementById("slangInput");
      const result = document.getElementById("slangDecodeResult");
      if(input && result){
        const slangMap = {"아이스":"필로폰(메스암페타민)","작대기":"주사기","떡":"대마초 압축분","야바":"메스암페타민 알약","찰리":"코카인","초코":"헤로인","LSD":"환각제","빽빽이":"필로폰 대량(1kg↑)"};
        const text = input.value;
        let decoded = text;
        let found = [];
        Object.entries(slangMap).forEach(([term,meaning])=>{
          if(text.includes(term)){ decoded = decoded.replace(new RegExp(term,"g"),`<mark title="${meaning}">${term}(=${meaning})</mark>`); found.push(`${term} → ${meaning}`); }
        });
        result.innerHTML = found.length ? `<div style="margin-bottom:8px;color:#16a34a;font-size:12px">탐지된 은어 ${found.length}건</div>${decoded}<hr style="margin:8px 0;border-color:#dde8ff"><div style="font-size:12px;color:#6b7f9e">${found.join(" | ")}</div>` : `<span style="color:#6b7f9e">탐지된 은어가 없습니다: ${ctx.escapeHtml(text)}</span>`;
      }
      return;
    }

    const slangSuggestBtn = event.target.closest("[data-slang-suggest]");
    if(slangSuggestBtn){
      const input = document.getElementById("slangInput");
      if(input) input.value = slangSuggestBtn.dataset.slangSuggest;
      return;
    }
  });
}
