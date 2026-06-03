export function registerGeneralInvestigationEvents(ctx){
  document.addEventListener("click", (event) => {
    const giRegTypeBtn = event.target.closest("[data-gi-reg-type]");
    if(giRegTypeBtn){
      ctx.giRegTargetType = giRegTypeBtn.dataset.giRegType;
      if(ctx.giRegTargetType === "person") ctx.loadRiskPersons();
      ctx.render("generalinv");
      return;
    }

    const giRegToggle = event.target.closest("[data-gi-reg-toggle]");
    if(giRegToggle){
      ctx.showGenInvRegForm = !ctx.showGenInvRegForm;
      if(ctx.showGenInvRegForm){
        if(!ctx.scenarioCompanies.length) ctx.loadScenarioCompanies();
      }
      ctx.render("generalinv");
      return;
    }

    const giRegister = event.target.closest("[data-gi-register]");
    if(giRegister){
      const selectedId = document.getElementById("giRegTargetSelect")?.value || "";
      if(!selectedId){ alert("수사 대상을 선택하세요."); return; }
      const invTypeId = document.getElementById("giRegTypeSelect")?.value || ctx.GEN_INV_TYPES[0].id;

      let targetName, extraFields = {};
      if(ctx.giRegTargetType === "company"){
        const co = ctx.findCompanyById(selectedId) || ctx.scenarioCompanies.find(c => c.company_id === selectedId);
        targetName = co?.company_name || selectedId;
        extraFields = { companyId: selectedId, targetType:"company" };
      } else {
        const person = ctx.riskPersonById(selectedId);
        targetName = person?.name || selectedId;
        extraFields = {
          targetType:"person", personId: selectedId,
          personProfileType: person?.profile_type || "",
          personRiskLevel:   person?.risk_level   || "",
          personRiskScore:   person?.risk_score,
          personNationality: person?.nationality   || "",
        };
      }

      const caseId = `GI-${new Date().getFullYear()}-${String(ctx.customGenInvCases.length + ctx.defaultGenInvCases.length + 1).padStart(3,"0")}`;
      const newCase = {
        caseId, targetName, invTypeId,
        ...extraFields,
        status:{ label:"대기", tone:"wait", pct:0, done:0, total:7 },
        investigator: ctx.currentUser().name,
        team: ctx.currentUserGroup().org + " " + ctx.currentUserGroup().team,
        created: new Date().toLocaleDateString("ko-KR"),
        updated: "방금",
        ownerUserId: ctx.currentUserId,
        assignees: [ctx.currentUserId],
      };
      ctx.customGenInvCases.unshift(newCase);
      ctx.showGenInvRegForm = false;
      ctx.giRegTargetType   = "company";
      // 탭 이동 없이 목록에 카드만 등록
      ctx.saveCanvasState();
      ctx.render("generalinv");
      return;
    }

    const giRemoveCase = event.target.closest("[data-gi-remove-case]");
    if(giRemoveCase){
      event.stopPropagation();
      const caseId = giRemoveCase.dataset.giRemoveCase;
      const idx = ctx.defaultGenInvCases.findIndex(c => c.caseId === caseId);
      if(idx !== -1) ctx.defaultGenInvCases.splice(idx, 1);
      const cidx = ctx.customGenInvCases.findIndex(c => c.caseId === caseId);
      if(cidx !== -1) ctx.customGenInvCases.splice(cidx, 1);
      if(ctx.activeGenInvCaseId === caseId){ ctx.activeGenInvCaseId = null; ctx.generalInvTab = "cases"; }
      ctx.saveCanvasState(); ctx.render("generalinv"); return;
    }

    const giArchiveCase = event.target.closest("[data-gi-archive-case]");
    if(giArchiveCase){
      event.stopPropagation();
      const caseId = giArchiveCase.dataset.giArchiveCase;
      const fromDefault = ctx.defaultGenInvCases.findIndex(c => c.caseId === caseId);
      const fromCustom  = ctx.customGenInvCases.findIndex(c => c.caseId === caseId);
      const c = fromDefault !== -1 ? ctx.defaultGenInvCases.splice(fromDefault, 1)[0]
              : fromCustom  !== -1 ? ctx.customGenInvCases.splice(fromCustom, 1)[0] : null;
      if(c){ ctx.archivedGenInvCases.unshift({...c, archivedAt: new Date().toLocaleString()}); }
      if(ctx.activeGenInvCaseId === caseId){ ctx.activeGenInvCaseId = null; ctx.generalInvTab = "cases"; }
      ctx.saveCanvasState(); ctx.render("generalinv"); return;
    }

    const giRestoreCase = event.target.closest("[data-gi-restore-case]");
    if(giRestoreCase){
      event.stopPropagation();
      const caseId = giRestoreCase.dataset.giRestoreCase;
      const idx = ctx.archivedGenInvCases.findIndex(c => c.caseId === caseId);
      if(idx !== -1){ ctx.customGenInvCases.push(ctx.archivedGenInvCases.splice(idx, 1)[0]); }
      ctx.saveCanvasState(); ctx.render("generalinv"); return;
    }

    const giToggleArchive = event.target.closest("[data-gi-toggle-archive]");
    if(giToggleArchive){
      ctx.genInvArchiveOpen = !ctx.genInvArchiveOpen;
      ctx.render("generalinv"); return;
    }

    const giCase = event.target.closest("[data-gi-case]");
    if(giCase){
      ctx.activeGenInvCaseId = giCase.dataset.giCase;
      ctx.generalInvTab      = "profile";
      ctx.activeGiStepId     = null;
      ctx.saveCanvasState();
      ctx.render("generalinv");
      return;
    }

    const giStepSelect = event.target.closest("[data-gi-step-select]");
    if(giStepSelect && !event.target.closest("[data-gi-step-up],[data-gi-step-down]")){
      ctx.activeGiStepId = giStepSelect.dataset.giStepSelect;
      ctx.saveCanvasState();
      ctx.render("generalinv");
      return;
    }

    const giStepUp = event.target.closest("[data-gi-step-up]");
    if(giStepUp){
      const aCase = ctx.activeGenInvCase();
      const steps = aCase?.giSteps;
      if(steps){
        const id = giStepUp.dataset.giStepUp;
        const i = steps.findIndex(s => s.id === id);
        if(i > 0){ [steps[i-1], steps[i]] = [steps[i], steps[i-1]]; }
      }
      ctx.saveCanvasState();
      ctx.render("generalinv");
      return;
    }

    const giStepDown = event.target.closest("[data-gi-step-down]");
    if(giStepDown){
      const aCase = ctx.activeGenInvCase();
      const steps = aCase?.giSteps;
      if(steps){
        const id = giStepDown.dataset.giStepDown;
        const i = steps.findIndex(s => s.id === id);
        if(i >= 0 && i < steps.length - 1){ [steps[i], steps[i+1]] = [steps[i+1], steps[i]]; }
      }
      ctx.saveCanvasState();
      ctx.render("generalinv");
      return;
    }

    const giStepAdd = event.target.closest("[data-gi-step-add]");
    if(giStepAdd){
      const sel = document.getElementById("giWbAddSource");
      if(!sel?.value){ alert("추가할 단계를 선택하세요."); return; }
      const key = sel.value;
      const src = ctx.giSourceByKey(key);
      const aCase = ctx.activeGenInvCase();
      if(aCase){
        if(!aCase.giSteps) ctx.activeGiCaseSteps();
        const sourceKey = ctx.giCommonSourceKey(src.key);
        aCase.giSteps.push(ctx.normalizeGiScenarioStep({
          ...src,
          id:`gis_${ctx.uid()}`,
          sourceKey,
          targetType: aCase.targetType || "company",
          target_type: aCase.targetType || "company",
          behaviors: ctx.sourceDefaultBehaviors(sourceKey),
          instruction: ctx.sourceDefaultInstruction(sourceKey, aCase.targetType),
        }, aCase.giSteps.length));
        ctx.activeGiStepId = aCase.giSteps[aCase.giSteps.length - 1].id;
      }
      ctx.saveCanvasState();
      ctx.render("generalinv");
      return;
    }

    const giStepDelete = event.target.closest("[data-gi-step-delete]");
    if(giStepDelete){
      const id = giStepDelete.dataset.giStepDelete;
      const aCase = ctx.activeGenInvCase();
      if(aCase?.giSteps){
        aCase.giSteps = aCase.giSteps.filter(s => s.id !== id);
        if(aCase.stepStates) delete aCase.stepStates[id];
        if(ctx.activeGiStepId === id) ctx.activeGiStepId = null;
      }
      ctx.saveCanvasState();
      ctx.render("generalinv");
      return;
    }

    /* ── 템플릿 적용 (공통 워크벤치 템플릿 select) ── */
    const giTemplateApply = event.target.closest("[data-gi-template-apply]");
    if(giTemplateApply){
      const sel = document.getElementById("giWbTemplateSelect");
      const tplId = sel?.value;
      if(!tplId){ alert("템플릿을 선택하세요."); return; }
      const tpl = ctx.giScenarioTemplates?.find(t => t.id === tplId);
      const aCase = ctx.activeGenInvCase();
      if(aCase && tpl){
        aCase.giSteps = tpl.items.map((item, i) =>
          ctx.normalizeGiScenarioStep({ ...item, id:`gis_${ctx.uid()}` }, i)
        );
        aCase.stepStates  = {};
        aCase.stepResults = {};
        aCase.stepExpanded= {};
        ctx.activeGiStepId = aCase.giSteps[0]?.id || null;
        ctx.saveCanvasState();
        ctx.render("generalinv");
      }
      return;
    }

    /* ── 권한 요청 (공통 워크벤치 권한 없음 배너) ── */
    const giPermReq = event.target.closest("[data-gi-step-request-perm]");
    if(giPermReq){
      const key = giPermReq.dataset.giStepRequestPerm;
      ctx.requestPermission?.(key);
      ctx.render("generalinv");
      return;
    }

    const giRunStep = event.target.closest("[data-gi-run-step]");
    if(giRunStep){
      const val = giRunStep.dataset.giRunStep;
      const colonIdx = val.indexOf(":");
      const caseId = val.slice(0, colonIdx);
      const stepId = val.slice(colonIdx + 1);
      const aCase = ctx.allGenInvCases().find(c => c.caseId === caseId);
      if(aCase){
        const steps = ctx.activeGenInvCaseId === caseId ? ctx.activeGiCaseSteps() : (aCase.giSteps || []);
        if(stepId === "all"){
          /* 완료되지 않은 전체 단계를 SSE로 실행 */
          const toRun = steps.filter(s => (aCase.stepStates||{})[s.id] !== "done");
          ctx.giStreamSteps(aCase, toRun.length ? toRun : steps);
        } else {
          /* 개별 단계 실행 */
          const step = steps.find(s => s.id === stepId);
          if(step) ctx.giStreamSteps(aCase, [step]);
        }
      }
      return;
    }

    const giRerunStep = event.target.closest("[data-gi-rerun-step]");
    if(giRerunStep){
      const val = giRerunStep.dataset.giRerunStep;
      const colonIdx = val.indexOf(":");
      const caseId = val.slice(0, colonIdx);
      const stepId = val.slice(colonIdx + 1);
      const aCase = ctx.allGenInvCases().find(c => c.caseId === caseId);
      if(aCase){
        if(!aCase.stepStates)  aCase.stepStates  = {};
        if(!aCase.stepResults) aCase.stepResults = {};
        const steps = ctx.activeGenInvCaseId === caseId ? ctx.activeGiCaseSteps() : (aCase.giSteps || []);
        if(stepId === "clear"){
          /* 전체 초기화 (재실행 없이 상태만 지움) */
          if(ctx.giRunEventSource){ ctx.giRunEventSource.close(); ctx.giRunEventSource = null; }
          aCase.stepStates  = {};
          aCase.stepResults = {};
          aCase.stepExpanded = {};
          aCase.stepsDone = 0;
          aCase.status = { ...aCase.status, done:0, pct:0, label:"대기", tone:"wait" };
          ctx.saveCanvasState();
          ctx.render("generalinv");
        } else {
          /* 개별 단계 재실행: 상태 초기화 후 SSE 실행 */
          delete aCase.stepStates[stepId];
          delete aCase.stepResults[stepId];
          const step = steps.find(s => s.id === stepId);
          if(step) ctx.giStreamSteps(aCase, [step]);
        }
      }
      return;
    }

    const giToggleResult = event.target.closest("[data-gi-toggle-result]");
    if(giToggleResult){
      const stepId = giToggleResult.dataset.giToggleResult;
      const aCase  = ctx.activeGenInvCase();
      if(aCase){
        if(!aCase.stepExpanded) aCase.stepExpanded = {};
        aCase.stepExpanded[stepId] = !aCase.stepExpanded[stepId];
        ctx.saveCanvasState();
        ctx.render("generalinv");
      }
      return;
    }

    const giType = event.target.closest("[data-gi-type]");
    if(giType){
      const typeId = giType.dataset.giType;
      const aCase  = ctx.activeGenInvCase();
      if(aCase){
        const idx = ctx.customGenInvCases.findIndex(c => c.caseId === aCase.caseId);
        if(idx >= 0) ctx.customGenInvCases[idx].invTypeId = typeId;
        else {
          const di = ctx.defaultGenInvCases.findIndex(c => c.caseId === aCase.caseId);
          if(di >= 0) ctx.defaultGenInvCases[di].invTypeId = typeId;
        }
      }
      ctx.saveCanvasState();
      ctx.render("generalinv");
      return;
    }

    const giTab = event.target.closest("[data-gi-tab]");
    if(giTab){
      ctx.generalInvTab = giTab.dataset.giTab;
      ctx.saveCanvasState();
      ctx.render("generalinv");
      return;
    }
  });
}
