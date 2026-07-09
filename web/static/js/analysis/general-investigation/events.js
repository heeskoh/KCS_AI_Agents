import { generalInvestigationState } from "./state.js";
import { giInvTypeForCrimes } from "./crime-taxonomy.js";
import { leadTypeById, leadDocLabel, buildLeadDraftPrompt } from "./leads.js";
import { streamLlmText } from "../shared/llm-stream.js";

/* 혐의 확정 → 수사유형 템플릿 적용 (data-gi-template-apply와 동일 로직) */
function giApplyCrimeTemplate(ctx, aCase, tplId){
  const tpl = ctx.giScenarioTemplates?.find(t => t.id === tplId);
  if(!tpl) return;
  aCase.giSteps = tpl.items.map((item, i) =>
    ctx.normalizeGiScenarioStep({
      ...item,
      id: `gis_${ctx.uid()}`,
      targetType: aCase.targetType || "company",
      target_type: aCase.targetType || "company",
    }, i)
  );
  aCase.stepStates   = {};
  aCase.stepResults  = {};
  aCase.stepExpanded = {};
  ctx.activeGiStepId = aCase.giSteps[0]?.id || null;
}

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
        // 수사 개편: 혐의 범죄(상세에서 지정) + 수사단서 이력 + 외부 자료요청 + 수사정보 분석 대화
        crimes: { categoryId: null, offenseIds: [] },
        leads: [],
        externalRequests: [],
        insightChat: [],
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

    /* ── 혐의 범죄 선택 (사건 상세) ───────────────────────────────── */
    const giCrimeCat = event.target.closest("[data-gi-crime-cat]");
    if(giCrimeCat){
      const aCase = ctx.activeGenInvCase();
      const base = generalInvestigationState.crimeDraft
        || (aCase?.crimes?.categoryId ? { categoryId: aCase.crimes.categoryId, offenseIds: [...(aCase.crimes.offenseIds || [])] } : { categoryId: null, offenseIds: [] });
      const catId = giCrimeCat.dataset.giCrimeCat;
      generalInvestigationState.crimeDraft = base.categoryId === catId
        ? base
        : { categoryId: catId, offenseIds: [] };
      ctx.render("generalinv");
      return;
    }

    const giCrimeOffense = event.target.closest("[data-gi-crime-offense]");
    if(giCrimeOffense){
      const draft = generalInvestigationState.crimeDraft;
      if(!draft) return;
      const id = giCrimeOffense.dataset.giCrimeOffense;
      draft.offenseIds = draft.offenseIds.includes(id)
        ? draft.offenseIds.filter(v => v !== id)
        : [...draft.offenseIds, id];
      ctx.render("generalinv");
      return;
    }

    const giCrimeApply = event.target.closest("[data-gi-crime-apply]");
    if(giCrimeApply){
      const aCase = ctx.activeGenInvCase();
      const draft = generalInvestigationState.crimeDraft
        || (aCase?.crimes?.categoryId ? aCase.crimes : null);
      if(!aCase || !draft?.categoryId){ alert("혐의 대분류를 선택하세요."); return; }
      if(!draft.offenseIds?.length){ alert("죄명을 1개 이상 선택하세요."); return; }
      aCase.crimes = { categoryId: draft.categoryId, offenseIds: [...draft.offenseIds] };
      const invTypeId = giInvTypeForCrimes(aCase.crimes);
      const typeChanged = invTypeId !== aCase.invTypeId;
      aCase.invTypeId = invTypeId;
      // 혐의에 맞는 분석 시나리오 매핑: 단계 미구성이면 지연 초기화가 새 유형을 따르고,
      // 기존 구성이 있으면 사용자 확인 후 템플릿 재적용
      if(aCase.giSteps?.length && typeChanged
        && confirm("혐의에 맞는 분석 시나리오 템플릿을 적용할까요?\n기존 단계 구성과 실행 결과가 대체됩니다.")){
        giApplyCrimeTemplate(ctx, aCase, invTypeId);
      }
      generalInvestigationState.crimeDraft = null;
      ctx.saveCanvasState();
      ctx.render("generalinv");
      return;
    }

    /* ── 수사단서(leads) 등록·문서 작성 (사건 상세) ─────────────────── */
    const giLeadType = event.target.closest("[data-gi-lead-type]");
    if(giLeadType){
      generalInvestigationState.leadFormType = giLeadType.dataset.giLeadType;
      generalInvestigationState.leadFormStage = "plan";
      ctx.render("generalinv");
      return;
    }

    const giLeadStage = event.target.closest("[data-gi-lead-stage]");
    if(giLeadStage){
      generalInvestigationState.leadFormStage = giLeadStage.dataset.giLeadStage;
      ctx.render("generalinv");
      return;
    }

    const giLeadAdd = event.target.closest("[data-gi-lead-add]");
    if(giLeadAdd){
      const aCase = ctx.activeGenInvCase();
      if(!aCase) return;
      const title = String(document.getElementById("giLeadTitle")?.value || "").trim();
      const content = String(document.getElementById("giLeadContent")?.value || "").trim();
      if(!title && !content){ alert("제목 또는 내용을 입력하세요."); return; }
      const typeDef = leadTypeById(generalInvestigationState.leadFormType);
      const lead = {
        id: `lead_${ctx.uid()}`,
        type: typeDef.id,
        stage: typeDef.stages ? generalInvestigationState.leadFormStage : undefined,
        title, content,
        grade: typeDef.hasGrade ? (document.getElementById("giLeadGrade")?.value || "B") : undefined,
        parentLeadId: document.getElementById("giLeadParentSelect")?.value || undefined,
        aiDraft: "", draft: "",
        confirmed: false, confirmedAt: null,
        createdAt: Date.now(),
        createdLabel: new Date().toLocaleString("ko-KR"),
        author: ctx.currentUser().name,
      };
      lead.docType = leadDocLabel(lead);
      if(!aCase.leads) aCase.leads = [];
      aCase.leads.push(lead);
      generalInvestigationState.activeLeadId = lead.id;   // 등록 직후 문서 작성으로 이동
      ctx.saveCanvasState();
      ctx.render("generalinv");
      return;
    }

    const giLeadRemove = event.target.closest("[data-gi-lead-remove]");
    if(giLeadRemove){
      event.stopPropagation();
      const aCase = ctx.activeGenInvCase();
      if(!aCase?.leads) return;
      const id = giLeadRemove.dataset.giLeadRemove;
      aCase.leads = aCase.leads.filter(lead => lead.id !== id);
      if(generalInvestigationState.activeLeadId === id) generalInvestigationState.activeLeadId = null;
      ctx.saveCanvasState();
      ctx.render("generalinv");
      return;
    }

    const giLeadSelect = event.target.closest("[data-gi-lead-select]");
    if(giLeadSelect){
      generalInvestigationState.activeLeadId = giLeadSelect.dataset.giLeadSelect || null;
      ctx.render("generalinv");
      return;
    }

    const giLeadDraft = event.target.closest("[data-gi-lead-draft]");
    if(giLeadDraft){
      const aCase = ctx.activeGenInvCase();
      const lead = aCase?.leads?.find(item => item.id === giLeadDraft.dataset.giLeadDraft);
      if(!lead || generalInvestigationState.leadDraftStreaming) return;
      generalInvestigationState.leadDraftStreaming = true;
      ctx.render("generalinv");   // 스트리밍 상태(버튼 비활성·스트림 영역)로 1회 재렌더
      (async () => {
        // mode "int": 내부 LLM 단독(웹검색 컨텍스트 생략 — 문서 초안에는 불필요·지연 방지)
        const result = await streamLlmText(buildLeadDraftPrompt(aCase, lead), {
          mode: "int",
          onToken: acc => {
            // 스트리밍 중 전체 재렌더 금지 — 대상 DOM만 갱신
            const el = document.getElementById("giLeadDraftStream");
            if(el){ el.hidden = false; el.textContent = acc; el.scrollTop = el.scrollHeight; }
          },
        });
        if(result){
          lead.aiDraft = result;
          lead.draft = result;
        } else {
          alert("LLM 응답을 받지 못했습니다. 잠시 후 다시 시도하거나 본문을 직접 작성하세요.");
        }
        generalInvestigationState.leadDraftStreaming = false;
        ctx.saveCanvasState();
        ctx.render("generalinv");
      })();
      return;
    }

    const giLeadConfirm = event.target.closest("[data-gi-lead-confirm]");
    if(giLeadConfirm){
      const aCase = ctx.activeGenInvCase();
      const lead = aCase?.leads?.find(item => item.id === giLeadConfirm.dataset.giLeadConfirm);
      if(!lead) return;
      const text = String(document.getElementById("giLeadDraftText")?.value || "").trim();
      if(!text){ alert("문서 본문을 작성하거나 AI 초안을 생성한 뒤 확정하세요."); return; }
      lead.draft = text;
      lead.confirmed = true;
      lead.confirmedAt = new Date().toLocaleString("ko-KR");
      ctx.saveCanvasState();
      ctx.render("generalinv");
      return;
    }

    /* ── 기초자료: 외부 자료요청 접수(주민등록·전화가입자·금융거래) ── */
    const giExtRequest = event.target.closest("[data-gi-ext-request]");
    if(giExtRequest){
      const aCase = ctx.activeGenInvCase();
      if(!aCase) return;
      const kind = giExtRequest.dataset.giExtRequest;
      const input = document.getElementById(`giExtTarget_${kind}`);
      const target = String(input?.value || "").trim();
      if(!target){ alert("요청 대상을 입력하세요."); input?.focus(); return; }
      if(!aCase.externalRequests) aCase.externalRequests = [];
      aCase.externalRequests.unshift({
        id: `ext_${ctx.uid()}`,
        kind, target,
        status: "접수됨",
        requestedAt: new Date().toLocaleString("ko-KR"),
        requester: ctx.currentUser().name,
      });
      ctx.saveCanvasState();
      ctx.render("generalinv");
      return;
    }

    const giExtAdvance = event.target.closest("[data-gi-ext-advance]");
    if(giExtAdvance){
      const aCase = ctx.activeGenInvCase();
      const request = aCase?.externalRequests?.find(item => item.id === giExtAdvance.dataset.giExtAdvance);
      if(!request) return;
      request.status = request.status === "접수됨" ? "회신대기" : "회신완료";
      ctx.saveCanvasState();
      ctx.render("generalinv");
      return;
    }

    const giExtRemove = event.target.closest("[data-gi-ext-remove]");
    if(giExtRemove){
      const aCase = ctx.activeGenInvCase();
      if(!aCase?.externalRequests) return;
      aCase.externalRequests = aCase.externalRequests.filter(item => item.id !== giExtRemove.dataset.giExtRemove);
      ctx.saveCanvasState();
      ctx.render("generalinv");
      return;
    }

    /* ── 프로파일: 외부 정보 출처 메모(인터넷·신문·서적) ────────────── */
    const giExtNoteAdd = event.target.closest("[data-gi-extnote-add]");
    if(giExtNoteAdd){
      const aCase = ctx.activeGenInvCase();
      if(!aCase) return;
      const title = String(document.getElementById("giExtNoteTitle")?.value || "").trim();
      const memo = String(document.getElementById("giExtNoteMemo")?.value || "").trim();
      if(!title && !memo){ alert("출처 제목 또는 메모를 입력하세요."); return; }
      if(!aCase.externalNotes) aCase.externalNotes = [];
      aCase.externalNotes.push({
        kind: document.getElementById("giExtNoteKind")?.value || "기타",
        title, memo,
        addedAt: new Date().toLocaleDateString("ko-KR"),
      });
      ctx.saveCanvasState();
      ctx.render("generalinv");
      return;
    }

    const giExtNoteRemove = event.target.closest("[data-gi-extnote-remove]");
    if(giExtNoteRemove){
      const aCase = ctx.activeGenInvCase();
      if(!aCase?.externalNotes) return;
      aCase.externalNotes.splice(Number(giExtNoteRemove.dataset.giExtnoteRemove), 1);
      ctx.saveCanvasState();
      ctx.render("generalinv");
      return;
    }

    /* ── 수사정보 분석 탭 (3단: Chat/시각화/정보카드) ─────────────── */
    const giInsightView = event.target.closest("[data-gi-insight-view]");
    if(giInsightView){
      generalInvestigationState.insightView = giInsightView.dataset.giInsightView;
      ctx.render("generalinv");
      return;
    }

    const giInsightGroup = event.target.closest("[data-gi-insight-group]");
    if(giInsightGroup){
      const id = giInsightGroup.dataset.giInsightGroup;
      const open = generalInvestigationState.insightGroupsOpen;
      open[id] = open[id] === false;   // 기본 펼침 → 토글
      ctx.render("generalinv");
      return;
    }

    const giInsightCite = event.target.closest("[data-gi-insight-cite]");
    if(giInsightCite){
      // 카드 클릭 → 좌측 대화 입력에 인용 삽입 (재렌더 없이 입력만 갱신)
      const chat = document.getElementById("giInsightChat");
      if(chat?.insertCite) chat.insertCite(giInsightCite.dataset.giInsightCite || "");
      return;
    }

    const giCase = event.target.closest("[data-gi-case]");
    if(giCase){
      // 수사 개편: 사건 선택 시 프로파일로 점프하지 않고 진행중인 수사 탭에서 상세를 연다
      ctx.activeGenInvCaseId = giCase.dataset.giCase;
      ctx.activeGiStepId     = null;
      generalInvestigationState.activeLeadId = null;
      generalInvestigationState.crimeDraft = null;
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

    /* ── AI 서비스 카탈로그 토글 (선택형 시나리오) ─────────────────── */
    const giSvcToggle = event.target.closest("[data-gi-svc-toggle]");
    if(giSvcToggle){
      const key = giSvcToggle.dataset.giSvcToggle;
      const aCase = ctx.activeGenInvCase();
      if(!aCase) return;
      if(!aCase.giSteps) ctx.activeGiCaseSteps();
      const src = ctx.giSourceByKey(key);
      const sourceKey = ctx.giCommonSourceKey(src.key);
      const matched = (aCase.giSteps || []).filter(step =>
        (step.sourceKey || ctx.giCommonSourceKey(step.key)) === sourceKey);
      if(matched.length){
        // 해제: 같은 서비스의 모든 단계 제거(실행 결과 포함)
        const hasResults = matched.some(step => (aCase.stepResults || {})[step.id]);
        const note = matched.length > 1 ? `\n(같은 서비스 단계 ${matched.length}개가 함께 제거됩니다)` : "";
        if(!confirm(`'${src.label}'을(를) 시나리오에서 제거할까요?${hasResults ? "\n해당 단계의 실행 결과도 함께 삭제됩니다." : ""}${note}`)) return;
        const removeIds = new Set(matched.map(step => step.id));
        aCase.giSteps = aCase.giSteps.filter(step => !removeIds.has(step.id));
        removeIds.forEach(id => {
          if(aCase.stepStates) delete aCase.stepStates[id];
          if(aCase.stepResults) delete aCase.stepResults[id];
          if(aCase.stepExpanded) delete aCase.stepExpanded[id];
        });
        if(removeIds.has(ctx.activeGiStepId)) ctx.activeGiStepId = null;
      } else {
        // 선택: 시나리오 끝에 단계 추가 (기존 단계 추가 로직과 동일 구성)
        aCase.giSteps.push(ctx.normalizeGiScenarioStep({
          ...src,
          id: `gis_${ctx.uid()}`,
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
          ctx.normalizeGiScenarioStep({
            ...item,
            id:`gis_${ctx.uid()}`,
            targetType: aCase.targetType || "company",
            target_type: aCase.targetType || "company",
          }, i)
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
      ctx.requestPermissions?.([key]);
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
