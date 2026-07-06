import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, type HrDesignationResponse } from "@/api/client";
import { logApiError } from "@/utils/logApiError";

function crewEmpOptionKey(designationId: number | null | undefined, designationFilter: string | null | undefined) {
  if (designationId != null && designationId > 0) return `id:${designationId}`;
  return designationFilter?.trim() || "";
}

const OPTIONAL_UNITS = [
  { key: "knitting", label: "Knitting" },
  { key: "dyeing", label: "Dyeing" },
  { key: "printing", label: "Printing" },
  { key: "aop", label: "All over print (AOP)" },
  { key: "embroidery", label: "Embroidery" },
  { key: "elastic", label: "Elastic" },
  { key: "washing", label: "Washing" },
];

const btnToggle =
  "rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50";
const inputCls =
  "mt-1 w-full rounded-md border border-border-subtle bg-surface-elevated px-2 py-1.5 text-sm text-text-primary";
const thCls = "px-3 py-2 text-left text-xs font-medium text-text-secondary";
const tdCls = "px-3 py-2 text-sm text-text-primary whitespace-nowrap";

type SewingLine = Awaited<ReturnType<typeof api.listSewingLines>>[number];
type CrewRole = Awaited<ReturnType<typeof api.listCrewRoles>>[number];
type TemplateRow = Awaited<ReturnType<typeof api.getLineCrewTemplate>>[number];
type DepartmentMachine = Awaited<ReturnType<typeof api.listDepartmentMachines>>[number];

const getUnitMachineKey = (unitKey: string, machineId: number) => `${unitKey}:${machineId}`;

type ProductionSettingsState = {
  factory_profile: string | null;
  enabled_optional_units: string[];
  weekend_days: string[];
  cm_alert_threshold_pct: number;
};

function mapProductionSettings(
  s: Awaited<ReturnType<typeof api.getProductionSettings>>,
): ProductionSettingsState {
  return {
    factory_profile: s.factory_profile ?? null,
    enabled_optional_units: s.enabled_optional_units ?? [],
    weekend_days: s.weekend_days ?? [],
    cm_alert_threshold_pct: s.cm_alert_threshold_pct ?? 10,
  };
}

export function ProductionSetupPage() {
  const [settings, setSettings] = useState<ProductionSettingsState | null>(null);
  const [factoryProfiles, setFactoryProfiles] = useState<
    Array<{ key: string; label: string; description: string }>
  >([]);
  const [selectedFactoryProfile, setSelectedFactoryProfile] = useState("");
  const [factoryProfileSaving, setFactoryProfileSaving] = useState(false);
  const [factoryProfileMsg, setFactoryProfileMsg] = useState("");
  const [lines, setLines] = useState<SewingLine[]>([]);
  const [shifts, setShifts] = useState<Awaited<ReturnType<typeof api.listProductionShifts>>>([]);
  const [error, setError] = useState("");

  /* --- Line add form --- */
  const [showLineForm, setShowLineForm] = useState(false);
  const [lineForm, setLineForm] = useState({
    line_code: "",
    name: "",
    default_machine_count: 0,
    running_machine_count: 0,
    default_operator_count: 0,
    default_helper_count: 0,
    supervisor_employee_id: null as number | null,
  });
  const [lineSupervisorOptions, setLineSupervisorOptions] = useState<
    Array<{ id: number; name: string; employee_code: string; user_id: number | null }>
  >([]);
  const [lineFormError, setLineFormError] = useState("");

  /* --- Inline line edit --- */
  const [editingLineId, setEditingLineId] = useState<number | null>(null);
  const [editFields, setEditFields] = useState({
    default_machine_count: 0,
    running_machine_count: 0,
    default_operator_count: 0,
    default_helper_count: 0,
  });

  /* --- Shift add form --- */
  const [showShiftForm, setShowShiftForm] = useState(false);
  const [shiftForm, setShiftForm] = useState({
    shift_code: "",
    name: "",
    start_time: "",
    end_time: "",
    break_minutes: 0,
  });
  const [shiftFormError, setShiftFormError] = useState("");
  const [openLineActionsId, setOpenLineActionsId] = useState<number | null>(null);
  const [openShiftActionsId, setOpenShiftActionsId] = useState<number | null>(null);
  const [editingShiftId, setEditingShiftId] = useState<number | null>(null);
  const [editShiftFields, setEditShiftFields] = useState({
    shift_code: "",
    name: "",
    start_time: "",
    end_time: "",
    break_minutes: 0,
  });

  /* --- Crew roles --- */
  const [crewRoles, setCrewRoles] = useState<CrewRole[]>([]);
  const [crewDept, setCrewDept] = useState("sewing");
  const [crewRoleForm, setCrewRoleForm] = useState({
    role_key: "",
    role_name: "",
    is_named: false,
    designation_id: null as number | null,
    designation_filter: "",
    sort_order: 0,
  });
  const [designations, setDesignations] = useState<HrDesignationResponse[]>([]);
  const [crewRoleError, setCrewRoleError] = useState("");

  /* --- Line crew template --- */
  const [templateLineId, setTemplateLineId] = useState<number | null>(null);
  const [templateRows, setTemplateRows] = useState<TemplateRow[]>([]);
  const [templateSaving, setTemplateSaving] = useState(false);
  const [templateMsg, setTemplateMsg] = useState("");
  const [employeeOptions, setEmployeeOptions] = useState<Record<string, Array<{ id: number; name: string }>>>({});
  const [lineTemplateMap, setLineTemplateMap] = useState<Record<number, TemplateRow[]>>({});
  const [lineTemplateSavingMap, setLineTemplateSavingMap] = useState<Record<number, boolean>>({});
  const [lineTemplateMsgMap, setLineTemplateMsgMap] = useState<Record<number, string>>({});
  /** Line-wise default crew: which line is shown (avoids rendering 100+ cards). */
  const [selectedCrewLineId, setSelectedCrewLineId] = useState<number | null>(null);
  const [crewLineFilter, setCrewLineFilter] = useState("");
  /** Which line is currently fetching template (avoids race when switching lines quickly). */
  const [loadingLineTemplateId, setLoadingLineTemplateId] = useState<number | null>(null);
  const loadedLineTemplateIdsRef = useRef<Set<number>>(new Set());
  const [unitTemplateMap, setUnitTemplateMap] = useState<Record<string, TemplateRow[]>>({});
  const [unitTemplateSavingMap, setUnitTemplateSavingMap] = useState<Record<string, boolean>>({});
  const [unitTemplateMsgMap, setUnitTemplateMsgMap] = useState<Record<string, string>>({});
  const [unitMachineMap, setUnitMachineMap] = useState<Record<string, DepartmentMachine[]>>({});
  const [unitMachineTemplateMap, setUnitMachineTemplateMap] = useState<Record<string, TemplateRow[]>>({});
  const [unitMachineSavingMap, setUnitMachineSavingMap] = useState<Record<string, boolean>>({});
  const [unitMachineMsgMap, setUnitMachineMsgMap] = useState<Record<string, string>>({});
  const [openUnitMachineOverrides, setOpenUnitMachineOverrides] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setError("");
    try {
      const [s, l, sh, des, profiles] = await Promise.all([
        api.getProductionSettings(),
        api.listSewingLines(),
        api.listProductionShifts(),
        api.listHrDesignations({ active_only: true }),
        api.listFactoryProfiles(),
      ]);
      setSettings(mapProductionSettings(s));
      setFactoryProfiles(profiles);
      setSelectedFactoryProfile(s.factory_profile ?? "");
      setLines(l);
      setShifts(sh);
      setDesignations(des);
      setCrewRoles(await api.listCrewRoles());
      try {
        const lic = await api.listHrEmployeesForCrew({ designation_filter: "Line Incharge" });
        setLineSupervisorOptions(
          (lic.items ?? []).map((x: { id: number; name: string; employee_code: string; user_id?: number | null }) => ({
            id: x.id,
            name: x.name,
            employee_code: x.employee_code,
            user_id: x.user_id ?? null,
          })),
        );
      } catch {
        setLineSupervisorOptions([]);
      }
    } catch (e) {
      logApiError(e, "ProductionSetupPage.load");
      setError("Could not load production settings.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /* --- Settings handlers --- */
  const WEEKDAY_KEYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;

  const toggleWeekendDay = async (day: string) => {
    if (!settings) return;
    const cur = new Set(settings.weekend_days ?? []);
    if (cur.has(day)) cur.delete(day);
    else cur.add(day);
    try {
      const s = await api.updateProductionSettings({ weekend_days: [...cur] });
      setSettings(mapProductionSettings(s));
    } catch (e) {
      logApiError(e, "ProductionSetupPage.toggleWeekendDay");
    }
  };

  const saveCmThreshold = async (pct: number) => {
    if (!settings) return;
    try {
      const s = await api.updateProductionSettings({ cm_alert_threshold_pct: pct });
      setSettings(mapProductionSettings(s));
    } catch (e) {
      logApiError(e, "ProductionSetupPage.saveCmThreshold");
    }
  };

  const saveFactoryProfile = async () => {
    if (!selectedFactoryProfile) {
      setFactoryProfileMsg("Choose a factory profile first.");
      return;
    }
    setFactoryProfileSaving(true);
    setFactoryProfileMsg("");
    try {
      const s = await api.updateProductionSettings({ factory_profile: selectedFactoryProfile });
      setSettings(mapProductionSettings(s));
      setFactoryProfileMsg("Factory profile applied. Optional units and feature flags were updated.");
    } catch (e) {
      logApiError(e, "ProductionSetupPage.saveFactoryProfile");
      setFactoryProfileMsg(e instanceof Error ? e.message : "Could not apply factory profile.");
    } finally {
      setFactoryProfileSaving(false);
    }
  };

  const toggleUnit = async (key: string) => {
    if (!settings) return;
    const cur = new Set(settings.enabled_optional_units);
    if (cur.has(key)) cur.delete(key);
    else cur.add(key);
    try {
      const s = await api.updateProductionSettings({ enabled_optional_units: [...cur] });
      setSettings(mapProductionSettings(s));
      window.dispatchEvent(new Event("production-optional-units-changed"));
    } catch (e) {
      logApiError(e, "ProductionSetupPage.toggleUnit");
    }
  };

  const activeUnitCards = useMemo(
    () => OPTIONAL_UNITS.filter((u) => settings?.enabled_optional_units.includes(u.key)),
    [settings],
  );

  /** Lines shown in the line-wise crew dropdown (search + always include current selection). */
  const crewLineSelectOptions = useMemo(() => {
    const q = crewLineFilter.trim().toLowerCase();
    let filtered = lines;
    if (q) {
      filtered = lines.filter(
        (l) =>
          l.line_code.toLowerCase().includes(q) ||
          l.name.toLowerCase().includes(q),
      );
    }
    if (selectedCrewLineId != null) {
      const sel = lines.find((l) => l.id === selectedCrewLineId);
      if (sel && !filtered.some((l) => l.id === selectedCrewLineId)) {
        return [sel, ...filtered];
      }
    }
    return filtered;
  }, [lines, crewLineFilter, selectedCrewLineId]);

  const selectedCrewLine = useMemo(
    () => (selectedCrewLineId == null ? null : lines.find((l) => l.id === selectedCrewLineId) ?? null),
    [lines, selectedCrewLineId],
  );

  const selectedCrewLineTemplateRows = useMemo(
    () => (selectedCrewLine ? lineTemplateMap[selectedCrewLine.id] ?? [] : []),
    [selectedCrewLine, lineTemplateMap],
  );

  const loadingSelectedCrewLineTemplate =
    selectedCrewLine != null &&
    loadingLineTemplateId === selectedCrewLine.id &&
    selectedCrewLineTemplateRows.length === 0;

  const loadEmployeeOptionsForRows = useCallback(
    async (rows: TemplateRow[]) => {
      const keys = new Set<string>();
      for (const r of rows) {
        const k = crewEmpOptionKey(r.designation_id, r.designation_filter);
        if (k) keys.add(k);
      }
      for (const key of keys) {
        if (employeeOptions[key]) continue;
        try {
          const res = key.startsWith("id:")
            ? await api.listHrEmployeesForCrew({ designation_id: Number(key.slice(3)) })
            : await api.listHrEmployeesForCrew({ designation_filter: key });
          setEmployeeOptions((prev) => ({
            ...prev,
            [key]: (res.items ?? []).map((x) => ({ id: x.id, name: `${x.employee_code} - ${x.name}` })),
          }));
        } catch {
          setEmployeeOptions((prev) => ({ ...prev, [key]: [] }));
        }
      }
    },
    [employeeOptions],
  );

  /* --- Line handlers --- */
  const submitLine = async (e: React.FormEvent) => {
    e.preventDefault();
    setLineFormError("");
    if (!lineForm.line_code.trim() || !lineForm.name.trim()) {
      setLineFormError("Line code and name are required.");
      return;
    }
    try {
      const supEmpId = lineForm.supervisor_employee_id;
      const sup = supEmpId ? lineSupervisorOptions.find((x) => x.id === supEmpId) : null;
      await api.createSewingLine({
        line_code: lineForm.line_code.trim(),
        name: lineForm.name.trim(),
        default_machine_count: Number(lineForm.default_machine_count) || 0,
        running_machine_count: Number(lineForm.running_machine_count) || 0,
        default_operator_count: Number(lineForm.default_operator_count) || 0,
        default_helper_count: Number(lineForm.default_helper_count) || 0,
        supervisor_user_id: sup?.user_id ?? undefined,
      });
      const createdCode = lineForm.line_code.trim();
      setShowLineForm(false);
      setLineForm({
        line_code: "",
        name: "",
        default_machine_count: 0,
        running_machine_count: 0,
        default_operator_count: 0,
        default_helper_count: 0,
        supervisor_employee_id: null,
      });
      await load();
      const linesAfter = await api.listSewingLines();
      const newLine = linesAfter.find((x) => x.line_code === createdCode);
      if (newLine && supEmpId) {
        const tmpl = (await api.getLineCrewTemplate(newLine.id)) as TemplateRow[];
        const li = tmpl.find((x) => x.role_key === "line_incharge");
        if (li) {
          await api.putLineCrewTemplate(
            newLine.id,
            tmpl.map((x) => ({
              crew_role_id: x.crew_role_id,
              default_count: x.default_count,
              employee_id: x.crew_role_id === li.crew_role_id ? supEmpId : x.employee_id,
            })),
          );
        }
      }
    } catch (e) {
      logApiError(e, "ProductionSetupPage.submitLine");
      setLineFormError(e instanceof Error ? e.message : "Could not create sewing line.");
    }
  };

  const startEditLine = (line: SewingLine) => {
    setEditingLineId(line.id);
    setEditFields({
      default_machine_count: line.default_machine_count,
      running_machine_count: line.running_machine_count,
      default_operator_count: line.default_operator_count,
      default_helper_count: line.default_helper_count,
    });
  };

  const saveEditLine = async () => {
    if (editingLineId === null) return;
    try {
      await api.updateSewingLine(editingLineId, editFields);
      setEditingLineId(null);
      await load();
    } catch (e) {
      logApiError(e, "ProductionSetupPage.saveEditLine");
      setLineFormError(e instanceof Error ? e.message : "Could not update sewing line.");
    }
  };

  const deleteLine = async (id: number) => {
    if (!window.confirm("Delete this sewing line?")) return;
    try {
      await api.deleteSewingLine(id);
      await load();
    } catch (e) {
      logApiError(e, "ProductionSetupPage.deleteLine");
      setLineFormError(e instanceof Error ? e.message : "Could not delete sewing line.");
    }
  };

  const openTemplate = async (lineId: number) => {
    try {
      setTemplateMsg("");
      const rows = (await api.getLineCrewTemplate(lineId)) as TemplateRow[];
      setTemplateRows(rows);
      setTemplateLineId(lineId);
      await loadEmployeeOptionsForRows(rows);
    } catch (e) {
      logApiError(e, "ProductionSetupPage.openTemplate");
      setTemplateMsg("Could not load line crew template.");
    }
  };

  /** Fetch template for one line when selected (lazy; keeps edits when switching lines). */
  const loadLineTemplateForLineIfNeeded = useCallback(
    async (lineId: number) => {
      if (loadedLineTemplateIdsRef.current.has(lineId)) return;
      setLoadingLineTemplateId(lineId);
      try {
        const rows = (await api.getLineCrewTemplate(lineId)) as TemplateRow[];
        loadedLineTemplateIdsRef.current.add(lineId);
        setLineTemplateMap((prev) => ({ ...prev, [lineId]: rows }));
        await loadEmployeeOptionsForRows(rows);
      } catch (e) {
        logApiError(e, "ProductionSetupPage.loadLineTemplateForLine");
      } finally {
        setLoadingLineTemplateId((cur) => (cur === lineId ? null : cur));
      }
    },
    [loadEmployeeOptionsForRows],
  );

  useEffect(() => {
    if (lines.length === 0) {
      setSelectedCrewLineId(null);
      return;
    }
    setSelectedCrewLineId((prev) => {
      if (prev != null && lines.some((l) => l.id === prev)) return prev;
      return lines[0]?.id ?? null;
    });
  }, [lines]);

  useEffect(() => {
    const validIds = new Set(lines.map((l) => l.id));
    setLineTemplateMap((prev) => {
      const next: Record<number, TemplateRow[]> = {};
      for (const k of Object.keys(prev)) {
        const id = Number(k);
        if (validIds.has(id)) next[id] = prev[id] ?? [];
      }
      return next;
    });
    loadedLineTemplateIdsRef.current = new Set([...loadedLineTemplateIdsRef.current].filter((id) => validIds.has(id)));
  }, [lines]);

  useEffect(() => {
    if (selectedCrewLineId == null) return;
    void loadLineTemplateForLineIfNeeded(selectedCrewLineId);
  }, [selectedCrewLineId, loadLineTemplateForLineIfNeeded]);

  const loadUnitTemplates = useCallback(async () => {
    if (!settings?.enabled_optional_units?.length) {
      setUnitTemplateMap({});
      return;
    }
    try {
      const pairs = await Promise.all(
        settings.enabled_optional_units.map(async (unitKey) => [unitKey, (await api.getUnitCrewTemplate(unitKey, null)) as TemplateRow[]] as const),
      );
      const map: Record<string, TemplateRow[]> = {};
      for (const [unitKey, rows] of pairs) {
        map[unitKey] = rows;
      }
      setUnitTemplateMap(map);
      await loadEmployeeOptionsForRows(pairs.flatMap(([, rows]) => rows));
    } catch (e) {
      logApiError(e, "ProductionSetupPage.loadUnitTemplates");
    }
  }, [settings?.enabled_optional_units, loadEmployeeOptionsForRows]);

  useEffect(() => {
    void loadUnitTemplates();
  }, [loadUnitTemplates]);

  const loadUnitMachines = useCallback(async () => {
    if (!settings?.enabled_optional_units?.length) {
      setUnitMachineMap({});
      return;
    }
    try {
      const pairs = await Promise.all(
        settings.enabled_optional_units.map(async (unitKey) => [unitKey, await api.listDepartmentMachines(unitKey)] as const),
      );
      const map: Record<string, DepartmentMachine[]> = {};
      for (const [unitKey, machines] of pairs) {
        map[unitKey] = (machines ?? []).filter((m) => m.is_active);
      }
      setUnitMachineMap(map);
    } catch (e) {
      logApiError(e, "ProductionSetupPage.loadUnitMachines");
    }
  }, [settings?.enabled_optional_units]);

  useEffect(() => {
    void loadUnitMachines();
  }, [loadUnitMachines]);

  const saveLineTemplateDefaults = async (lineId: number) => {
    const rows = lineTemplateMap[lineId] ?? [];
    setLineTemplateSavingMap((prev) => ({ ...prev, [lineId]: true }));
    setLineTemplateMsgMap((prev) => ({ ...prev, [lineId]: "" }));
    try {
      await api.putLineCrewTemplate(
        lineId,
        rows.map((r) => ({
          crew_role_id: r.crew_role_id,
          default_count: Number(r.default_count) || 0,
          employee_id: r.employee_id ?? null,
        })),
      );
      setLineTemplateMsgMap((prev) => ({ ...prev, [lineId]: "Saved." }));
    } catch (e) {
      logApiError(e, "ProductionSetupPage.saveLineTemplateDefaults");
      setLineTemplateMsgMap((prev) => ({ ...prev, [lineId]: "Could not save." }));
    } finally {
      setLineTemplateSavingMap((prev) => ({ ...prev, [lineId]: false }));
    }
  };

  const saveUnitTemplateDefaults = async (unitKey: string) => {
    const rows = unitTemplateMap[unitKey] ?? [];
    setUnitTemplateSavingMap((prev) => ({ ...prev, [unitKey]: true }));
    setUnitTemplateMsgMap((prev) => ({ ...prev, [unitKey]: "" }));
    try {
      await api.putUnitCrewTemplate(unitKey, {
        machine_id: null,
        rows: rows.map((r) => ({
          crew_role_id: r.crew_role_id,
          default_count: Number(r.default_count) || 0,
          employee_id: r.employee_id ?? null,
        })),
      });
      setUnitTemplateMsgMap((prev) => ({ ...prev, [unitKey]: "Saved." }));
    } catch (e) {
      logApiError(e, "ProductionSetupPage.saveUnitTemplateDefaults");
      setUnitTemplateMsgMap((prev) => ({ ...prev, [unitKey]: "Could not save." }));
    } finally {
      setUnitTemplateSavingMap((prev) => ({ ...prev, [unitKey]: false }));
    }
  };

  const loadMachineOverridesForUnit = async (unitKey: string) => {
    const machines = unitMachineMap[unitKey] ?? [];
    if (machines.length === 0) return;
    try {
      const pairs = await Promise.all(
        machines.map(async (machine) => [machine.id, (await api.getUnitCrewTemplate(unitKey, machine.id)) as TemplateRow[]] as const),
      );
      const next = { ...unitMachineTemplateMap };
      for (const [machineId, rows] of pairs) {
        next[getUnitMachineKey(unitKey, machineId)] = rows;
      }
      setUnitMachineTemplateMap(next);
      await loadEmployeeOptionsForRows(pairs.flatMap(([, rows]) => rows));
    } catch (e) {
      logApiError(e, "ProductionSetupPage.loadMachineOverridesForUnit");
    }
  };

  const saveMachineOverride = async (unitKey: string, machineId: number) => {
    const mapKey = getUnitMachineKey(unitKey, machineId);
    const rows = unitMachineTemplateMap[mapKey] ?? [];
    setUnitMachineSavingMap((prev) => ({ ...prev, [mapKey]: true }));
    setUnitMachineMsgMap((prev) => ({ ...prev, [mapKey]: "" }));
    try {
      await api.putUnitCrewTemplate(unitKey, {
        machine_id: machineId,
        rows: rows.map((r) => ({
          crew_role_id: r.crew_role_id,
          default_count: Number(r.default_count) || 0,
          employee_id: r.employee_id ?? null,
        })),
      });
      setUnitMachineMsgMap((prev) => ({ ...prev, [mapKey]: "Saved." }));
    } catch (e) {
      logApiError(e, "ProductionSetupPage.saveMachineOverride");
      setUnitMachineMsgMap((prev) => ({ ...prev, [mapKey]: "Could not save." }));
    } finally {
      setUnitMachineSavingMap((prev) => ({ ...prev, [mapKey]: false }));
    }
  };

  const saveTemplate = async () => {
    if (!templateLineId) return;
    setTemplateSaving(true);
    setTemplateMsg("");
    try {
      await api.putLineCrewTemplate(
        templateLineId,
        templateRows.map((r) => ({
          crew_role_id: r.crew_role_id,
          default_count: Number(r.default_count) || 0,
          employee_id: r.employee_id ?? null,
        })),
      );
      setTemplateMsg("Crew template saved.");
    } catch (e) {
      logApiError(e, "ProductionSetupPage.saveTemplate");
      setTemplateMsg("Could not save crew template.");
    } finally {
      setTemplateSaving(false);
    }
  };

  const reloadCrewRoles = async (department_type?: string) => {
    setCrewRoles(await api.listCrewRoles(department_type));
  };

  const createCrewRole = async (e: React.FormEvent) => {
    e.preventDefault();
    setCrewRoleError("");
    if (!crewRoleForm.role_key.trim() || !crewRoleForm.role_name.trim()) {
      setCrewRoleError("Role key and role name are required.");
      return;
    }
    try {
      await api.createCrewRole({
        department_type: crewDept,
        role_key: crewRoleForm.role_key.trim().toLowerCase(),
        role_name: crewRoleForm.role_name.trim(),
        is_named: crewRoleForm.is_named,
        designation_id: crewRoleForm.designation_id,
        designation_filter: crewRoleForm.designation_filter.trim() || null,
        sort_order: Number(crewRoleForm.sort_order) || 0,
        is_active: true,
      });
      setCrewRoleForm({
        role_key: "",
        role_name: "",
        is_named: false,
        designation_id: null,
        designation_filter: "",
        sort_order: 0,
      });
      await reloadCrewRoles(crewDept);
    } catch (err) {
      logApiError(err, "ProductionSetupPage.createCrewRole");
      setCrewRoleError("Could not create crew role.");
    }
  };

  const deleteCrewRole = async (id: number) => {
    if (!window.confirm("Delete this crew role?")) return;
    try {
      await api.deleteCrewRole(id);
      await reloadCrewRoles(crewDept);
    } catch (e) {
      logApiError(e, "ProductionSetupPage.deleteCrewRole");
      setCrewRoleError("Could not delete crew role.");
    }
  };

  /* --- Shift handlers --- */
  const submitShift = async (e: React.FormEvent) => {
    e.preventDefault();
    setShiftFormError("");
    if (!shiftForm.shift_code.trim() || !shiftForm.name.trim()) {
      setShiftFormError("Shift code and name are required.");
      return;
    }
    if (!shiftForm.start_time || !shiftForm.end_time) {
      setShiftFormError("Start time and end time are required.");
      return;
    }
    try {
      await api.createProductionShift({
        shift_code: shiftForm.shift_code.trim(),
        name: shiftForm.name.trim(),
        start_time: shiftForm.start_time,
        end_time: shiftForm.end_time,
        break_minutes: Number(shiftForm.break_minutes) || 0,
      });
      setShowShiftForm(false);
      setShiftForm({ shift_code: "", name: "", start_time: "", end_time: "", break_minutes: 0 });
      await load();
    } catch (e) {
      logApiError(e, "ProductionSetupPage.submitShift");
      setShiftFormError(e instanceof Error ? e.message : "Could not create shift.");
    }
  };

  const deleteShift = async (id: number) => {
    if (!window.confirm("Delete this shift?")) return;
    try {
      await api.deleteProductionShift(id);
      await load();
    } catch (e) {
      logApiError(e, "ProductionSetupPage.deleteShift");
      setShiftFormError(e instanceof Error ? e.message : "Could not delete shift.");
    }
  };

  const startEditShift = (s: (typeof shifts)[number]) => {
    setEditingShiftId(s.id);
    setEditShiftFields({
      shift_code: s.shift_code,
      name: s.name,
      start_time: s.start_time.length >= 5 ? s.start_time.slice(0, 5) : s.start_time,
      end_time: s.end_time.length >= 5 ? s.end_time.slice(0, 5) : s.end_time,
      break_minutes: s.break_minutes,
    });
  };

  const saveShiftEdit = async () => {
    if (editingShiftId === null) return;
    try {
      const st = editShiftFields.start_time.includes(":") && editShiftFields.start_time.split(":").length === 2
        ? `${editShiftFields.start_time}:00`
        : editShiftFields.start_time;
      const et = editShiftFields.end_time.includes(":") && editShiftFields.end_time.split(":").length === 2
        ? `${editShiftFields.end_time}:00`
        : editShiftFields.end_time;
      await api.updateProductionShift(editingShiftId, {
        shift_code: editShiftFields.shift_code,
        name: editShiftFields.name,
        start_time: st,
        end_time: et,
        break_minutes: editShiftFields.break_minutes,
      });
      setEditingShiftId(null);
      await load();
    } catch (e) {
      logApiError(e, "ProductionSetupPage.saveShiftEdit");
      setShiftFormError(e instanceof Error ? e.message : "Could not update shift.");
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-4">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Production setup</h1>
        <p className="text-sm text-text-secondary">
          Choose a factory profile for quick setup, then fine-tune optional units, sewing lines, and shifts.
        </p>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {settings ? (
        <section className="rounded-lg border border-border-subtle bg-surface-elevated p-4">
          <h2 className="mb-2 text-sm font-medium text-text-primary">Factory profile</h2>
          <p className="mb-3 text-xs text-text-secondary">
            Presets optional production units and related feature flags (for example knitting or trade). You can still
            adjust optional units manually below.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-[220px] flex-1 text-xs text-text-secondary">
              Profile
              <select
                className={inputCls}
                value={selectedFactoryProfile}
                onChange={(e) => setSelectedFactoryProfile(e.target.value)}
              >
                <option value="">Select profile…</option>
                {factoryProfiles.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className={btnToggle}
              disabled={factoryProfileSaving}
              onClick={() => void saveFactoryProfile()}
            >
              {factoryProfileSaving ? "Applying…" : "Apply profile"}
            </button>
          </div>
          {settings.factory_profile ? (
            <p className="mt-2 text-xs text-text-secondary">
              Current profile: <span className="font-medium text-text-primary">{settings.factory_profile}</span>
            </p>
          ) : null}
          {selectedFactoryProfile ? (
            <p className="mt-2 text-xs text-text-secondary">
              {factoryProfiles.find((p) => p.key === selectedFactoryProfile)?.description}
            </p>
          ) : null}
          {factoryProfileMsg ? <p className="mt-2 text-xs text-text-secondary">{factoryProfileMsg}</p> : null}
        </section>
      ) : null}

      {settings ? (
        <section className="rounded-lg border border-border-subtle bg-surface-elevated p-4">
          <h2 className="mb-2 text-sm font-medium text-text-primary">Weekend days &amp; CM alerts</h2>
          <p className="mb-2 text-xs text-text-secondary">Weekend flags are stored on tenant production settings. CM threshold drives variance alerts.</p>
          <div className="mb-3 flex flex-wrap gap-2">
            {WEEKDAY_KEYS.map((day) => (
              <label key={day} className="flex cursor-pointer items-center gap-2 rounded-md border border-border-subtle px-2 py-1 text-xs">
                <input
                  type="checkbox"
                  checked={(settings.weekend_days ?? []).includes(day)}
                  onChange={() => void toggleWeekendDay(day)}
                />
                {day}
              </label>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs text-text-secondary">
              CM alert threshold (%)
              <input
                type="number"
                min={0}
                step={0.5}
                className={inputCls + " max-w-[120px]"}
                value={settings.cm_alert_threshold_pct}
                onChange={(e) =>
                  setSettings((prev) =>
                    prev
                      ? {
                          ...prev,
                          cm_alert_threshold_pct: Number(e.target.value) || 0,
                        }
                      : prev,
                  )
                }
              />
            </label>
            <button
              type="button"
              className={btnToggle}
              onClick={() => void saveCmThreshold(settings.cm_alert_threshold_pct)}
            >
              Save threshold
            </button>
          </div>
        </section>
      ) : null}

      {/* ========== Optional units ========== */}
      {settings ? (
        <section className="rounded-lg border border-border-subtle bg-surface-elevated p-4">
          <h2 className="mb-3 text-sm font-medium text-text-primary">Optional units</h2>
          <div className="flex flex-wrap gap-2">
            {OPTIONAL_UNITS.map((u) => (
              <label key={u.key} className="flex cursor-pointer items-center gap-2 rounded-md border border-border-subtle px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={settings.enabled_optional_units.includes(u.key)}
                  onChange={() => void toggleUnit(u.key)}
                />
                {u.label}
              </label>
            ))}
          </div>
          {activeUnitCards.length > 0 ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {activeUnitCards.map((u) => (
                <div key={u.key} className="rounded-lg border border-border-subtle bg-surface-raised p-3">
                  <p className="text-sm font-medium text-text-primary">{u.label}</p>
                  <div className="mt-2 flex flex-wrap gap-3 text-xs">
                    <Link className="text-brand-primary underline" to="/app/production/setup">
                      Manage crew roles
                    </Link>
                    <Link className="text-brand-primary underline" to={`/app/production/hourly/${u.key}`}>
                      Hourly production
                    </Link>
                    <Link className="text-brand-primary underline" to={`/app/production/dept/${u.key}`}>
                      Department page
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {activeUnitCards.length > 0 ? (
            <div className="mt-6 space-y-4 rounded-lg border border-border-subtle bg-surface-raised p-4">
              <div>
                <h3 className="text-sm font-medium text-text-primary">Optional unit default crew list (override allowed)</h3>
                <p className="text-xs text-text-secondary">
                  Each active unit is prefilled from crew roles. Update counts per role and save each unit.
                </p>
              </div>
              {activeUnitCards.map((unit) => {
                const rows = unitTemplateMap[unit.key] ?? [];
                const machines = unitMachineMap[unit.key] ?? [];
                const machineOpen = !!openUnitMachineOverrides[unit.key];
                return (
                  <div key={unit.key} className="rounded-lg border border-border-subtle bg-surface-elevated p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-text-primary">{unit.label}</p>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="rounded-lg border border-gray-300 px-3 py-1 text-xs text-gray-700 hover:bg-gray-50"
                          onClick={() => void saveUnitTemplateDefaults(unit.key)}
                          disabled={unitTemplateSavingMap[unit.key]}
                        >
                          {unitTemplateSavingMap[unit.key] ? "Saving..." : "Save defaults"}
                        </button>
                        {unitTemplateMsgMap[unit.key] ? (
                          <span className="text-xs text-text-secondary">{unitTemplateMsgMap[unit.key]}</span>
                        ) : null}
                      </div>
                    </div>
                    {rows.length > 0 ? (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left">
                          <thead className="border-b border-border-subtle">
                            <tr>
                              <th className={thCls}>Role</th>
                              <th className={thCls}>Default count</th>
                              <th className={thCls}>Employee (named role)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border-subtle/60">
                            {rows.map((r) => (
                              <tr key={`${unit.key}-${r.crew_role_id}`}>
                                <td className={tdCls}>{r.role_name}</td>
                                <td className={tdCls}>
                                  <input
                                    type="number"
                                    min={0}
                                    className="w-24 rounded border border-border-subtle bg-surface-elevated px-2 py-1 text-sm"
                                    value={r.default_count}
                                    onChange={(e) =>
                                      setUnitTemplateMap((prev) => ({
                                        ...prev,
                                        [unit.key]: (prev[unit.key] ?? []).map((x) =>
                                          x.crew_role_id === r.crew_role_id
                                            ? { ...x, default_count: Number(e.target.value) || 0 }
                                            : x,
                                        ),
                                      }))
                                    }
                                  />
                                </td>
                                <td className={tdCls}>
                                  {r.is_named ? (
                                    <select
                                      className="rounded border border-border-subtle bg-surface-elevated px-2 py-1 text-sm"
                                      value={r.employee_id ?? ""}
                                      onChange={(e) =>
                                        setUnitTemplateMap((prev) => ({
                                          ...prev,
                                          [unit.key]: (prev[unit.key] ?? []).map((x) =>
                                            x.crew_role_id === r.crew_role_id
                                              ? { ...x, employee_id: e.target.value ? Number(e.target.value) : null }
                                              : x,
                                          ),
                                        }))
                                      }
                                    >
                                      <option value="">Select employee</option>
                                      {(employeeOptions[crewEmpOptionKey(r.designation_id, r.designation_filter)] ?? []).map((x) => (
                                        <option key={x.id} value={x.id}>
                                          {x.name}
                                        </option>
                                      ))}
                                    </select>
                                  ) : (
                                    <span className="text-text-secondary">Count-based role</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="text-xs text-text-secondary">No crew template rows found for this unit.</p>
                    )}

                    <div className="mt-3 rounded-md border border-border-subtle bg-surface-raised p-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <p className="text-xs font-medium text-text-primary">Per machine overrides</p>
                        <button
                          type="button"
                          className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50"
                          onClick={() => {
                            const nextOpen = !machineOpen;
                            setOpenUnitMachineOverrides((prev) => ({ ...prev, [unit.key]: nextOpen }));
                            if (nextOpen) void loadMachineOverridesForUnit(unit.key);
                          }}
                        >
                          {machineOpen ? "Hide machine overrides" : "Show machine overrides"}
                        </button>
                      </div>
                      {machineOpen ? (
                        machines.length > 0 ? (
                          <div className="space-y-3">
                            {machines.map((machine) => {
                              const mapKey = getUnitMachineKey(unit.key, machine.id);
                              const machineRows = unitMachineTemplateMap[mapKey] ?? [];
                              return (
                                <div key={mapKey} className="rounded-md border border-border-subtle bg-surface-elevated p-3">
                                  <div className="mb-2 flex items-center justify-between gap-2">
                                    <p className="text-xs font-medium text-text-primary">
                                      {machine.machine_code} - {machine.name}
                                    </p>
                                    <div className="flex items-center gap-2">
                                      <button
                                        type="button"
                                        className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50"
                                        onClick={() => void saveMachineOverride(unit.key, machine.id)}
                                        disabled={unitMachineSavingMap[mapKey]}
                                      >
                                        {unitMachineSavingMap[mapKey] ? "Saving..." : "Save machine override"}
                                      </button>
                                      {unitMachineMsgMap[mapKey] ? (
                                        <span className="text-xs text-text-secondary">{unitMachineMsgMap[mapKey]}</span>
                                      ) : null}
                                    </div>
                                  </div>
                                  {machineRows.length > 0 ? (
                                    <div className="overflow-x-auto">
                                      <table className="w-full text-left">
                                        <thead className="border-b border-border-subtle">
                                          <tr>
                                            <th className={thCls}>Role</th>
                                            <th className={thCls}>Default count</th>
                                            <th className={thCls}>Employee (named role)</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border-subtle/60">
                                          {machineRows.map((r) => (
                                            <tr key={`${mapKey}-${r.crew_role_id}`}>
                                              <td className={tdCls}>{r.role_name}</td>
                                              <td className={tdCls}>
                                                <input
                                                  type="number"
                                                  min={0}
                                                  className="w-24 rounded border border-border-subtle bg-surface-elevated px-2 py-1 text-sm"
                                                  value={r.default_count}
                                                  onChange={(e) =>
                                                    setUnitMachineTemplateMap((prev) => ({
                                                      ...prev,
                                                      [mapKey]: (prev[mapKey] ?? []).map((x) =>
                                                        x.crew_role_id === r.crew_role_id
                                                          ? { ...x, default_count: Number(e.target.value) || 0 }
                                                          : x,
                                                      ),
                                                    }))
                                                  }
                                                />
                                              </td>
                                              <td className={tdCls}>
                                                {r.is_named ? (
                                                  <select
                                                    className="rounded border border-border-subtle bg-surface-elevated px-2 py-1 text-sm"
                                                    value={r.employee_id ?? ""}
                                                    onChange={(e) =>
                                                      setUnitMachineTemplateMap((prev) => ({
                                                        ...prev,
                                                        [mapKey]: (prev[mapKey] ?? []).map((x) =>
                                                          x.crew_role_id === r.crew_role_id
                                                            ? { ...x, employee_id: e.target.value ? Number(e.target.value) : null }
                                                            : x,
                                                        ),
                                                      }))
                                                    }
                                                  >
                                                    <option value="">Select employee</option>
                                                    {(employeeOptions[crewEmpOptionKey(r.designation_id, r.designation_filter)] ?? []).map((x) => (
                                                      <option key={x.id} value={x.id}>
                                                        {x.name}
                                                      </option>
                                                    ))}
                                                  </select>
                                                ) : (
                                                  <span className="text-text-secondary">Count-based role</span>
                                                )}
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  ) : (
                                    <p className="text-xs text-text-secondary">No rows found for this machine override yet.</p>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="text-xs text-text-secondary">No active machines found for this optional unit.</p>
                        )
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
        </section>
      ) : null}

      {/* ========== Sewing lines ========== */}
      <section className="rounded-lg border border-border-subtle bg-surface-elevated p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium text-text-primary">Sewing lines</h2>
          <button type="button" className={btnToggle} onClick={() => setShowLineForm((v) => !v)}>
            {showLineForm ? "Close" : "Add line"}
          </button>
        </div>

        {lineFormError ? <p className="mb-2 text-sm text-red-600">{lineFormError}</p> : null}

        {showLineForm ? (
          <form onSubmit={(e) => void submitLine(e)} className="mb-4 space-y-3 rounded-lg border border-border-subtle bg-surface-raised p-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <label className="block text-xs text-text-secondary">
                Line code *
                <input className={inputCls} value={lineForm.line_code} onChange={(e) => setLineForm((f) => ({ ...f, line_code: e.target.value }))} maxLength={32} required />
              </label>
              <label className="block text-xs text-text-secondary">
                Name *
                <input className={inputCls} value={lineForm.name} onChange={(e) => setLineForm((f) => ({ ...f, name: e.target.value }))} required />
              </label>
              <label className="block text-xs text-text-secondary">
                Total machines
                <input type="number" min={0} className={inputCls} value={lineForm.default_machine_count} onChange={(e) => setLineForm((f) => ({ ...f, default_machine_count: Number(e.target.value) }))} />
              </label>
              <label className="block text-xs text-text-secondary">
                Running machines
                <input type="number" min={0} className={inputCls} value={lineForm.running_machine_count} onChange={(e) => setLineForm((f) => ({ ...f, running_machine_count: Number(e.target.value) }))} />
              </label>
              <label className="block text-xs text-text-secondary">
                Operators
                <input type="number" min={0} className={inputCls} value={lineForm.default_operator_count} onChange={(e) => setLineForm((f) => ({ ...f, default_operator_count: Number(e.target.value) }))} />
              </label>
              <label className="block text-xs text-text-secondary">
                Helpers
                <input type="number" min={0} className={inputCls} value={lineForm.default_helper_count} onChange={(e) => setLineForm((f) => ({ ...f, default_helper_count: Number(e.target.value) }))} />
              </label>
              <label className="block text-xs text-text-secondary sm:col-span-2">
                Supervisor (Line Incharge) — optional
                <select
                  className={inputCls}
                  value={lineForm.supervisor_employee_id ?? ""}
                  onChange={(e) =>
                    setLineForm((f) => ({
                      ...f,
                      supervisor_employee_id: e.target.value ? Number(e.target.value) : null,
                    }))
                  }
                >
                  <option value="">None</option>
                  {lineSupervisorOptions.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.employee_code} - {e.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button type="submit" className="rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-brand-primary-foreground">
              Save line
            </button>
          </form>
        ) : null}

        {/* Lines table */}
        {lines.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="border-b border-border-subtle">
                <tr>
                  <th className={thCls}>Code</th>
                  <th className={thCls}>Name</th>
                  <th className={thCls}>Total machines</th>
                  <th className={thCls}>Running machines</th>
                  <th className={thCls}>Operators</th>
                  <th className={thCls}>Helpers</th>
                  <th className={thCls}>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle/60">
                {lines.map((l) => {
                  const isEditing = editingLineId === l.id;
                  return (
                    <tr key={l.id} className="hover:bg-surface-raised/50">
                      <td className={tdCls + " font-medium"}>{l.line_code}</td>
                      <td className={tdCls}>{l.name}</td>

                      {isEditing ? (
                        <>
                          <td className={tdCls}>
                            <input
                              type="number"
                              min={0}
                              className="w-20 rounded border border-border-subtle bg-surface-elevated px-1.5 py-1 text-sm"
                              value={editFields.default_machine_count}
                              onChange={(e) => setEditFields((f) => ({ ...f, default_machine_count: Number(e.target.value) }))}
                            />
                          </td>
                          <td className={tdCls}>
                            <input
                              type="number"
                              min={0}
                              className="w-20 rounded border border-border-subtle bg-surface-elevated px-1.5 py-1 text-sm"
                              value={editFields.running_machine_count}
                              onChange={(e) => setEditFields((f) => ({ ...f, running_machine_count: Number(e.target.value) }))}
                            />
                          </td>
                          <td className={tdCls}>
                            <input
                              type="number"
                              min={0}
                              className="w-20 rounded border border-border-subtle bg-surface-elevated px-1.5 py-1 text-sm"
                              value={editFields.default_operator_count}
                              onChange={(e) => setEditFields((f) => ({ ...f, default_operator_count: Number(e.target.value) }))}
                            />
                          </td>
                          <td className={tdCls}>
                            <input
                              type="number"
                              min={0}
                              className="w-20 rounded border border-border-subtle bg-surface-elevated px-1.5 py-1 text-sm"
                              value={editFields.default_helper_count}
                              onChange={(e) => setEditFields((f) => ({ ...f, default_helper_count: Number(e.target.value) }))}
                            />
                          </td>
                          <td className={tdCls}>
                            <div className="flex gap-1">
                              <button
                                type="button"
                                className="rounded-lg border border-green-400 px-2 py-1 text-xs text-green-700 hover:bg-green-50"
                                onClick={() => void saveEditLine()}
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                className="rounded-lg border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
                                onClick={() => setEditingLineId(null)}
                              >
                                Cancel
                              </button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className={tdCls}>{l.default_machine_count}</td>
                          <td className={tdCls}>
                            <span className={l.running_machine_count < l.default_machine_count ? "font-semibold text-amber-600" : ""}>
                              {l.running_machine_count}
                            </span>
                          </td>
                          <td className={tdCls}>{l.default_operator_count}</td>
                          <td className={tdCls}>{l.default_helper_count}</td>
                          <td className={tdCls}>
                            <div className="relative">
                              <button
                                type="button"
                                className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50"
                                onClick={() => setOpenLineActionsId((x) => (x === l.id ? null : l.id))}
                              >
                                Actions
                              </button>
                              {openLineActionsId === l.id ? (
                                <div className="absolute right-0 z-10 mt-1 w-36 rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
                                  <button
                                    type="button"
                                    className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
                                    onClick={() => {
                                      startEditLine(l);
                                      setOpenLineActionsId(null);
                                    }}
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
                                    onClick={() => {
                                      void openTemplate(l.id);
                                      setOpenLineActionsId(null);
                                    }}
                                  >
                                    Crew template
                                  </button>
                                  <button
                                    type="button"
                                    className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-red-600 hover:bg-red-50"
                                    onClick={() => {
                                      void deleteLine(l.id);
                                      setOpenLineActionsId(null);
                                    }}
                                  >
                                    Delete
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-text-secondary">No lines yet. Use &quot;Add line&quot; above.</p>
        )}

        {templateLineId ? (
          <div className="mt-4 rounded-lg border border-border-subtle bg-surface-raised p-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-medium text-text-primary">Line crew template — Line #{templateLineId}</p>
              <button
                type="button"
                className="rounded-lg border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                onClick={() => setTemplateLineId(null)}
              >
                Close
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="border-b border-border-subtle">
                  <tr>
                    <th className={thCls}>Role</th>
                    <th className={thCls}>Default count</th>
                    <th className={thCls}>Employee (named role)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle/60">
                  {templateRows.map((r) => (
                    <tr key={r.crew_role_id}>
                      <td className={tdCls}>{r.role_name}</td>
                      <td className={tdCls}>
                        <input
                          type="number"
                          min={0}
                          className="w-24 rounded border border-border-subtle bg-surface-elevated px-2 py-1 text-sm"
                          value={r.default_count}
                          onChange={(e) =>
                            setTemplateRows((prev) =>
                              prev.map((x) => (x.crew_role_id === r.crew_role_id ? { ...x, default_count: Number(e.target.value) || 0 } : x)),
                            )
                          }
                        />
                      </td>
                      <td className={tdCls}>
                        {r.is_named ? (
                          <select
                            className="rounded border border-border-subtle bg-surface-elevated px-2 py-1 text-sm"
                            value={r.employee_id ?? ""}
                            onChange={(e) =>
                              setTemplateRows((prev) =>
                                prev.map((x) =>
                                  x.crew_role_id === r.crew_role_id
                                    ? { ...x, employee_id: e.target.value ? Number(e.target.value) : null }
                                    : x,
                                ),
                              )
                            }
                          >
                            <option value="">Select employee</option>
                            {(employeeOptions[crewEmpOptionKey(r.designation_id, r.designation_filter)] ?? []).map((x) => (
                              <option key={x.id} value={x.id}>
                                {x.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-text-secondary">Count-based role</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <button
                type="button"
                className="rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-brand-primary-foreground"
                onClick={() => void saveTemplate()}
                disabled={templateSaving}
              >
                {templateSaving ? "Saving..." : "Save template"}
              </button>
              {templateMsg ? <p className="text-sm text-text-secondary">{templateMsg}</p> : null}
            </div>
          </div>
        ) : null}

        <div className="mt-6 space-y-4 rounded-lg border border-border-subtle bg-surface-raised p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-medium text-text-primary">Line-wise default crew list (override allowed)</h3>
              <p className="text-xs text-text-secondary">
                Each line is prefilled from crew roles. Pick a line, update counts per role, then save.
              </p>
            </div>
            {lines.length > 0 ? (
              <span className="rounded-full border border-border-subtle bg-surface-elevated px-2.5 py-0.5 text-xs text-text-secondary">
                {lines.length} line{lines.length === 1 ? "" : "s"}
              </span>
            ) : null}
          </div>
          {lines.length === 0 ? (
            <p className="text-xs text-text-secondary">Add sewing lines above to configure default crew per line.</p>
          ) : (
            <>
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-text-secondary sm:max-w-md">
                  Search / select line
                  <input
                    type="search"
                    placeholder="Filter by code or name…"
                    className="rounded-md border border-border-subtle bg-surface-elevated px-2 py-1.5 text-sm text-text-primary"
                    value={crewLineFilter}
                    onChange={(e) => setCrewLineFilter(e.target.value)}
                  />
                </label>
                <div className="flex min-w-0 flex-1 flex-wrap items-end gap-2 sm:max-w-lg">
                  <label className="min-w-0 flex-1 text-xs text-text-secondary">
                    Line
                    <select
                      className="mt-1 w-full min-w-0 rounded-md border border-border-subtle bg-surface-elevated px-2 py-1.5 text-sm text-text-primary"
                      value={selectedCrewLineId ?? ""}
                      onChange={(e) => setSelectedCrewLineId(e.target.value ? Number(e.target.value) : null)}
                    >
                      {crewLineSelectOptions.length === 0 ? (
                        <option value="">No lines match filter</option>
                      ) : (
                        crewLineSelectOptions.map((line) => (
                          <option key={line.id} value={line.id}>
                            {line.line_code} — {line.name}
                          </option>
                        ))
                      )}
                    </select>
                  </label>
                  <div className="flex shrink-0 gap-1 pb-0.5">
                    <button
                      type="button"
                      className={btnToggle}
                      disabled={
                        selectedCrewLineId == null ||
                        lines.findIndex((l) => l.id === selectedCrewLineId) <= 0
                      }
                      onClick={() => {
                        const idx = lines.findIndex((l) => l.id === selectedCrewLineId);
                        if (idx > 0) {
                          const prevLine = lines[idx - 1];
                          if (prevLine) setSelectedCrewLineId(prevLine.id);
                        }
                      }}
                    >
                      Prev
                    </button>
                    <button
                      type="button"
                      className={btnToggle}
                      disabled={
                        selectedCrewLineId == null ||
                        lines.findIndex((l) => l.id === selectedCrewLineId) >= lines.length - 1
                      }
                      onClick={() => {
                        const idx = lines.findIndex((l) => l.id === selectedCrewLineId);
                        if (idx >= 0 && idx < lines.length - 1) {
                          const nextLine = lines[idx + 1];
                          if (nextLine) setSelectedCrewLineId(nextLine.id);
                        }
                      }}
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
              {selectedCrewLine ? (
                <div className="rounded-lg border border-border-subtle bg-surface-elevated p-3">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium text-text-primary">
                      {selectedCrewLine.line_code} - {selectedCrewLine.name}
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="rounded-lg border border-gray-300 px-3 py-1 text-xs text-gray-700 hover:bg-gray-50"
                        onClick={() => void saveLineTemplateDefaults(selectedCrewLine.id)}
                        disabled={lineTemplateSavingMap[selectedCrewLine.id] || loadingSelectedCrewLineTemplate}
                      >
                        {lineTemplateSavingMap[selectedCrewLine.id] ? "Saving..." : "Save defaults"}
                      </button>
                      {lineTemplateMsgMap[selectedCrewLine.id] ? (
                        <span className="text-xs text-text-secondary">{lineTemplateMsgMap[selectedCrewLine.id]}</span>
                      ) : null}
                    </div>
                  </div>
                  {loadingSelectedCrewLineTemplate ? (
                    <p className="text-xs text-text-secondary">Loading template…</p>
                  ) : selectedCrewLineTemplateRows.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left">
                        <thead className="border-b border-border-subtle">
                          <tr>
                            <th className={thCls}>Role</th>
                            <th className={thCls}>Default count</th>
                            <th className={thCls}>Employee (named role)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border-subtle/60">
                          {selectedCrewLineTemplateRows.map((r) => (
                            <tr key={`${selectedCrewLine.id}-${r.crew_role_id}`}>
                              <td className={tdCls}>{r.role_name}</td>
                              <td className={tdCls}>
                                <input
                                  type="number"
                                  min={0}
                                  className="w-24 rounded border border-border-subtle bg-surface-elevated px-2 py-1 text-sm"
                                  value={r.default_count}
                                  onChange={(e) =>
                                    setLineTemplateMap((prev) => ({
                                      ...prev,
                                      [selectedCrewLine.id]: (prev[selectedCrewLine.id] ?? []).map((x) =>
                                        x.crew_role_id === r.crew_role_id
                                          ? { ...x, default_count: Number(e.target.value) || 0 }
                                          : x,
                                      ),
                                    }))
                                  }
                                />
                              </td>
                              <td className={tdCls}>
                                {r.is_named ? (
                                  <select
                                    className="rounded border border-border-subtle bg-surface-elevated px-2 py-1 text-sm"
                                    value={r.employee_id ?? ""}
                                    onChange={(e) =>
                                      setLineTemplateMap((prev) => ({
                                        ...prev,
                                        [selectedCrewLine.id]: (prev[selectedCrewLine.id] ?? []).map((x) =>
                                          x.crew_role_id === r.crew_role_id
                                            ? { ...x, employee_id: e.target.value ? Number(e.target.value) : null }
                                            : x,
                                        ),
                                      }))
                                    }
                                  >
                                    <option value="">Select employee</option>
                                    {(employeeOptions[crewEmpOptionKey(r.designation_id, r.designation_filter)] ?? []).map((x) => (
                                      <option key={x.id} value={x.id}>
                                        {x.name}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <span className="text-text-secondary">Count-based role</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-xs text-text-secondary">No crew template rows found for this line.</p>
                  )}
                </div>
              ) : null}
            </>
          )}
        </div>
      </section>

      {/* ========== Shifts ========== */}
      <section className="rounded-lg border border-border-subtle bg-surface-elevated p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium text-text-primary">Shifts</h2>
          <button type="button" className={btnToggle} onClick={() => setShowShiftForm((v) => !v)}>
            {showShiftForm ? "Close" : "Add shift"}
          </button>
        </div>

        {shiftFormError ? <p className="mb-2 text-sm text-red-600">{shiftFormError}</p> : null}

        {showShiftForm ? (
          <form onSubmit={(e) => void submitShift(e)} className="mb-4 space-y-3 rounded-lg border border-border-subtle bg-surface-raised p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs text-text-secondary">
                Shift code *
                <input className={inputCls} value={shiftForm.shift_code} onChange={(e) => setShiftForm((f) => ({ ...f, shift_code: e.target.value }))} maxLength={16} required />
              </label>
              <label className="block text-xs text-text-secondary">
                Name *
                <input className={inputCls} value={shiftForm.name} onChange={(e) => setShiftForm((f) => ({ ...f, name: e.target.value }))} required />
              </label>
              <label className="block text-xs text-text-secondary">
                Start time *
                <input type="time" className={inputCls} value={shiftForm.start_time} onChange={(e) => setShiftForm((f) => ({ ...f, start_time: e.target.value }))} required />
              </label>
              <label className="block text-xs text-text-secondary">
                End time *
                <input type="time" className={inputCls} value={shiftForm.end_time} onChange={(e) => setShiftForm((f) => ({ ...f, end_time: e.target.value }))} required />
              </label>
              <label className="block text-xs text-text-secondary sm:col-span-2">
                Break (minutes)
                <input type="number" min={0} className={inputCls + " max-w-xs"} value={shiftForm.break_minutes} onChange={(e) => setShiftForm((f) => ({ ...f, break_minutes: Number(e.target.value) }))} />
              </label>
            </div>
            <button type="submit" className="rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-brand-primary-foreground">
              Save shift
            </button>
          </form>
        ) : null}

        {shifts.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="border-b border-border-subtle">
                <tr>
                  <th className={thCls}>Code</th>
                  <th className={thCls}>Name</th>
                  <th className={thCls}>Start</th>
                  <th className={thCls}>End</th>
                  <th className={thCls}>Break (min)</th>
                  <th className={thCls}>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle/60">
                {shifts.map((s) => {
                  const isEditing = editingShiftId === s.id;
                  return (
                    <tr key={s.id} className="hover:bg-surface-raised/50">
                      {isEditing ? (
                        <>
                          <td className={tdCls}>
                            <input
                              className="w-full rounded border border-border-subtle px-1 py-0.5 text-sm"
                              value={editShiftFields.shift_code}
                              onChange={(e) => setEditShiftFields((f) => ({ ...f, shift_code: e.target.value }))}
                            />
                          </td>
                          <td className={tdCls}>
                            <input
                              className="w-full rounded border border-border-subtle px-1 py-0.5 text-sm"
                              value={editShiftFields.name}
                              onChange={(e) => setEditShiftFields((f) => ({ ...f, name: e.target.value }))}
                            />
                          </td>
                          <td className={tdCls}>
                            <input
                              type="time"
                              className="w-full rounded border border-border-subtle px-1 py-0.5 text-sm"
                              value={editShiftFields.start_time}
                              onChange={(e) => setEditShiftFields((f) => ({ ...f, start_time: e.target.value }))}
                            />
                          </td>
                          <td className={tdCls}>
                            <input
                              type="time"
                              className="w-full rounded border border-border-subtle px-1 py-0.5 text-sm"
                              value={editShiftFields.end_time}
                              onChange={(e) => setEditShiftFields((f) => ({ ...f, end_time: e.target.value }))}
                            />
                          </td>
                          <td className={tdCls}>
                            <input
                              type="number"
                              min={0}
                              className="w-20 rounded border border-border-subtle px-1 py-0.5 text-sm"
                              value={editShiftFields.break_minutes}
                              onChange={(e) =>
                                setEditShiftFields((f) => ({ ...f, break_minutes: Number(e.target.value) || 0 }))
                              }
                            />
                          </td>
                          <td className={tdCls}>
                            <div className="flex gap-1">
                              <button
                                type="button"
                                className="rounded-lg border border-green-400 px-2 py-1 text-xs text-green-700 hover:bg-green-50"
                                onClick={() => void saveShiftEdit()}
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                className="rounded-lg border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
                                onClick={() => setEditingShiftId(null)}
                              >
                                Cancel
                              </button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className={tdCls + " font-medium"}>{s.shift_code}</td>
                          <td className={tdCls}>{s.name}</td>
                          <td className={tdCls}>{s.start_time}</td>
                          <td className={tdCls}>{s.end_time}</td>
                          <td className={tdCls}>{s.break_minutes}</td>
                          <td className={tdCls}>
                            <div className="relative">
                              <button
                                type="button"
                                className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50"
                                onClick={() => setOpenShiftActionsId((x) => (x === s.id ? null : s.id))}
                              >
                                Actions
                              </button>
                              {openShiftActionsId === s.id ? (
                                <div className="absolute right-0 z-10 mt-1 w-36 rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
                                  <button
                                    type="button"
                                    className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
                                    onClick={() => {
                                      startEditShift(s);
                                      setOpenShiftActionsId(null);
                                    }}
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-red-600 hover:bg-red-50"
                                    onClick={() => {
                                      void deleteShift(s.id);
                                      setOpenShiftActionsId(null);
                                    }}
                                  >
                                    Delete
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-text-secondary">No shifts defined. Use &quot;Add shift&quot; above for hourly planning.</p>
        )}
      </section>

      <section className="rounded-lg border border-border-subtle bg-surface-elevated p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium text-text-primary">Crew roles</h2>
          <select
            className="rounded-lg border border-border-subtle bg-surface-elevated px-2 py-1.5 text-xs"
            value={crewDept}
            onChange={(e) => {
              setCrewDept(e.target.value);
              void reloadCrewRoles(e.target.value);
            }}
          >
            <option value="sewing">Sewing</option>
            <option value="knitting">Knitting</option>
            <option value="dyeing">Dyeing</option>
            <option value="printing">Printing</option>
            <option value="aop">AOP</option>
            <option value="embroidery">Embroidery</option>
            <option value="elastic">Elastic</option>
            <option value="washing">Washing</option>
          </select>
        </div>
        {crewRoleError ? <p className="mb-2 text-sm text-red-600">{crewRoleError}</p> : null}
        <form onSubmit={(e) => void createCrewRole(e)} className="mb-4 grid gap-3 rounded-lg border border-border-subtle bg-surface-raised p-4 sm:grid-cols-2 lg:grid-cols-6">
          <label className="text-xs text-text-secondary">
            Role key
            <input className={inputCls} value={crewRoleForm.role_key} onChange={(e) => setCrewRoleForm((s) => ({ ...s, role_key: e.target.value }))} />
          </label>
          <label className="text-xs text-text-secondary">
            Role name
            <input className={inputCls} value={crewRoleForm.role_name} onChange={(e) => setCrewRoleForm((s) => ({ ...s, role_name: e.target.value }))} />
          </label>
          <label className="text-xs text-text-secondary">
            HR designation (preferred)
            <select
              className={inputCls}
              value={crewRoleForm.designation_id ?? ""}
              onChange={(e) =>
                setCrewRoleForm((s) => ({
                  ...s,
                  designation_id: e.target.value ? Number(e.target.value) : null,
                }))
              }
            >
              <option value="">— optional —</option>
              {designations.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-text-secondary">
            Designation label (fallback)
            <input
              className={inputCls}
              value={crewRoleForm.designation_filter}
              onChange={(e) => setCrewRoleForm((s) => ({ ...s, designation_filter: e.target.value }))}
              placeholder="Line Incharge"
            />
          </label>
          <label className="text-xs text-text-secondary">
            Sort order
            <input
              type="number"
              className={inputCls}
              value={crewRoleForm.sort_order}
              onChange={(e) => setCrewRoleForm((s) => ({ ...s, sort_order: Number(e.target.value) || 0 }))}
            />
          </label>
          <div className="flex items-end gap-2">
            <label className="flex items-center gap-2 text-xs text-text-secondary">
              <input type="checkbox" checked={crewRoleForm.is_named} onChange={(e) => setCrewRoleForm((s) => ({ ...s, is_named: e.target.checked }))} />
              Named role
            </label>
            <button type="submit" className="rounded-lg bg-brand-primary px-3 py-2 text-xs font-semibold text-brand-primary-foreground">
              Add role
            </button>
          </div>
        </form>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="border-b border-border-subtle">
              <tr>
                <th className={thCls}>Role key</th>
                <th className={thCls}>Role name</th>
                <th className={thCls}>Named</th>
                <th className={thCls}>Designation</th>
                <th className={thCls}>Sort</th>
                <th className={thCls}>Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle/60">
              {crewRoles
                .filter((r) => r.department_type === crewDept)
                .map((r) => (
                  <tr key={r.id}>
                    <td className={tdCls}>{r.role_key}</td>
                    <td className={tdCls}>{r.role_name}</td>
                    <td className={tdCls}>{r.is_named ? "Yes" : "No"}</td>
                    <td className={tdCls}>
                      {r.designation_id ? `#${r.designation_id}` : "—"} {r.designation_filter ? `(${r.designation_filter})` : ""}
                    </td>
                    <td className={tdCls}>{r.sort_order}</td>
                    <td className={tdCls}>
                      <button
                        type="button"
                        className="rounded-lg border border-gray-300 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                        onClick={() => void deleteCrewRole(r.id)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
