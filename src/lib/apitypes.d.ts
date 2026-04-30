/* tslint:disable */
/* eslint-disable */
// Generated using typescript-generator version 3.2.1263 on 2026-04-29 10:30:13.

export interface WebError {
    error: string;
}

export interface CoalitionGraph {
    name: string;
    alliances: { [index: string]: number };
    overall?: WebGraph;
    by_alliance: { [index: string]: WebGraph };
}

export interface CoalitionGraphs {
    spheres: CoalitionGraph[];
}

export interface DiscordRole {
    name: string;
    color: number;
}

export interface TaxExpenseBracket {
    taxId: number;
    bracket?: WebTaxBracket;
    nationCount: number;
    incomeValue: number;
    expenseValue: number;
    netValue: number;
    income: number[];
    expense: number[];
}

export interface TaxExpenseBracketRow {
    nationId: number;
    currentTaxId?: number;
    incomeValue: number;
    expenseValue: number;
    netValue: number;
}

export interface TaxExpenseBracketRows {
    taxId: number;
    rows: TaxExpenseBracketRow[];
}

export interface TaxExpenseNation {
    taxId: number;
    nationId: number;
    currentTaxId?: number;
    depositCount: number;
    transactionCount: number;
    incomeValue: number;
    expenseValue: number;
    netValue: number;
    income: number[];
    expense: number[];
    transactions: TaxExpenseTransactionRow[];
}

export interface TaxExpenseTime {
    datasetId: number;
    timestamps: number[];
    categories: TaxExpenseTimeCategory[];
    total: TaxExpenseTimeBracket;
    brackets: TaxExpenseTimeBracketSummary[];
}

export interface TaxExpenseTimeBracket {
    taxId: number;
    bracket?: WebTaxBracket;
    nationCount: number;
    incomeValue: number;
    expenseValue: number;
    netValue: number;
    overallByCategory: number[][];
}

export interface TaxExpenseTimeBracketSummary {
    taxId: number;
    bracket?: WebTaxBracket;
    nationCount: number;
    incomeValue: number;
    expenseValue: number;
    netValue: number;
}

export interface TaxExpenseTimeCategory {
    name: string;
    expense: boolean;
}

export interface TaxExpenseTimeResources {
    byResourceOrdinalByCategory: number[][][];
}

export interface TaxExpenseTransactionRow {
    txId: number;
    txDatetime: number;
    note: any;
    senderId: number;
    senderType: number;
    receiverId: number;
    receiverType: number;
    bankerNationId: number;
    resources: number[];
}

export interface SetGuild {
    id: string;
    name: string;
    icon: string;
}

export interface TradePriceByDayJson {
    x: string;
    y: string;
    labels: string[];
    timestamps: number[];
    prices: number[][];
}

export interface WebAnnouncement {
    id: number;
    type: number;
    active: boolean;
    title: string;
    content: string;
}

export interface WebAnnouncements {
    values: WebAnnouncement[];
}

export interface WebAudit {
    audit: string;
    severity: number;
    value: string;
    description: string;
}

export interface WebAudits {
    values: WebAudit[];
}

export interface WebBalance {
    id: number;
    is_aa: boolean;
    total: number[];
    include_grants: boolean;
    access: { [index: string]: number };
    breakdown: { [index: string]: number[] };
    no_access_msg?: string;
}

export interface WebBankAccess {
    access: { [index: string]: number };
}

export interface WebBulkQuery {
    results: any[];
}

export interface WebGraph {
    time_format?: TimeFormat;
    number_format?: TableNumberFormat;
    type?: GraphType;
    origin?: number;
    title: string;
    x: string;
    y: string;
    labels: string[];
    data: any[][];
}

export interface WebInt {
    value: number;
}

export interface WebMyEnemies {
    alliance_ids: number[];
    alliances: string[];
    commands: WebWarFinder[];
}

export interface WebMyWar {
    id: number;
    target: WebTarget;
    beigeReasons: { [index: string]: string };
    peace: number;
    blockade: number;
    ac: number;
    gc: number;
    ground_str: number;
    att_res: number;
    def_res: number;
    att_map: number;
    def_map: number;
    iron_dome: boolean;
    vds: boolean;
    att_fortified: boolean;
    def_fortified: boolean;
}

export interface WebMyWars {
    offensives: WebMyWar[];
    defensives: WebMyWar[];
    me: WebTarget;
    isFightingActives: boolean;
    soldier_cap: number;
    tank_cap: number;
    aircraft_cap: number;
    ship_cap: number;
    spy_cap: number;
}

export interface WebOptions {
    key_numeric?: number[];
    key_string?: string[];
    icon?: string[];
    text?: string[];
    subtext?: string[];
    color?: string[];
    size: number;
}

export interface WebSession {
    user?: string;
    user_name?: string;
    user_icon?: string;
    user_valid?: boolean;
    nation?: number;
    nation_name?: string;
    alliance?: number;
    alliance_name?: string;
    nation_valid?: boolean;
    expires: number;
    guild?: string;
    guild_name?: string;
    guild_icon?: string;
    registered?: boolean;
    registered_nation?: number;
    guild_alliances?: number[];
    guild_alliances_names?: string[];
    delegates_to: number;
    delegate_server_name?: string;
    fa_server: number;
    fa_server_name?: string;
    ma_server: number;
    ma_server_name?: string;
}

export interface WebSuccess {
    success: boolean;
    message?: string;
}

export interface WebTable {
    errors?: WebTableError[];
    cells: any[][];
    renderers?: string[];
}

export interface WebTableError {
    col?: number;
    row?: number;
    msg: string;
}

export interface WebTarget {
    id: number;
    nation: string;
    alliance_id: number;
    alliance: string;
    avg_infra: number;
    cities: number;
    soldier: number;
    tank: number;
    aircraft: number;
    ship: number;
    missile: number;
    nuke: number;
    spies: number;
    position: number;
    active_ms: number;
    color_id: number;
    beige_turns: number;
    off: number;
    def: number;
    score: number;
    expected: number;
    actual: number;
    strength: number;
}

export interface WebSpyTarget {
    id: number;
    nation: string;
    alliance_id: number;
    alliance: string;
    spies: number;
    score: number;
    active_ms: number;
    color_id: number;
    operation: number;
    safety: number;
    enemy_spies: number;
    attacker_spies: number;
    odds: number;
    kills: number;
    damage: number;
}

export interface WebSpyTargets {
    targets: WebSpyTarget[];
    self: WebTarget;
    message: string;
}

export interface WebViewCommand {
    uid: number;
    data: { [index: string]: any }[];
}

export interface WebTargets {
    targets: WebTarget[];
    include_strength: boolean;
    self: WebTarget;
}

export interface WebSimAdHocPlan {
    attackerId: number;
    horizonTurns: number;
    worthWaiting: boolean;
    suggestedWaitTurns: number;
    currentActivityChance: number;
    futureActivityChance: number;
    currentObjectiveScore: number;
    futureObjectiveScore: number;
    targets: WebSimAdHocTarget[];
    diagnostics: PlannerDiagnostic[];
    metadata: AdHocPlanMetadata;
}

export interface WebSimAdHocTarget {
    target: WebTarget;
    simScore: number;
    counterRisk: number;
    lootEstimate: number;
    scoreSummary: ScoreSummary;
}

export interface BlitzAssignedWar {
    declarerNationId: number;
    targetNationId: number;
    warTypeOrdinal: number;
    sourceOrdinal: number;
    initialAttackTypeOrdinal: number;
}

export interface BlitzDraftEdit {
    nationId: number;
    forceActive: boolean;
    policyOrdinal: number;
    avgInfraCents: number;
    unitCountsByMilitaryUnitOrdinal: number[];
    unitsBoughtTodayByMilitaryUnitOrdinal: number[];
    projectBitsSet: number;
    projectBitsClear: number;
    researchBitsSet: number;
    researchBitsClear: number;
    resetHour: number;
    clearBeige: boolean;
    clearVacationMode: boolean;
}

export interface BlitzExistingWar {
    warId: number;
    attackerNationId: number;
    defenderNationId: number;
    warTypeOrdinal: number;
    warStatusOrdinal: number;
    attackerMap: number;
    defenderMap: number;
    attackerResistance: number;
    defenderResistance: number;
    turnsLeft: number;
}

export interface BlitzLegalEdge {
    declarerNationId: number;
    targetNationId: number;
    legal: boolean;
    blockedReasonOrdinals: number[];
}

export interface BlitzMilitaryRules {
    warRangeMin: number;
    warRangeMax: number;
    defensiveSlotCap: number;
    baseOffensiveSlotCap: number;
    sameOpponentLockoutTurns: number;
    researchMaxLevel: number;
    bitsPerResearchSlot: number;
    mmrUnitOrdinals: number[];
    mmrMaxByUnitOrdinal: number[];
    capacityPerBuildingByUnitOrdinal: number[];
    dailyBuyPerBuildingByUnitOrdinal: number[];
    capacityResearchOrdinalByUnitOrdinal: number[];
    capacityResearchBonusByUnitOrdinal: number[];
    dailyBuyResearchOrdinalByUnitOrdinal: number[];
    dailyBuyResearchBonusByUnitOrdinal: number[];
    propagandaAffectsDailyBuyByUnitOrdinal: boolean[];
    militaryProjectOrdinals: number[];
    propagandaProjectOrdinal: number;
    missileLaunchPadProjectOrdinal: number;
    spaceProgramProjectOrdinal: number;
    nuclearResearchProjectOrdinal: number;
    nuclearLaunchProjectOrdinal: number;
    intelligenceAgencyProjectOrdinal: number;
    spySatelliteProjectOrdinal: number;
    propagandaDailyBuyMultiplier: number;
    missileLaunchPadDailyBuy: number;
    spaceProgramDailyBuy: number;
    nuclearResearchDailyBuy: number;
    nuclearLaunchDailyBuy: number;
    spyBaseDailyBuy: number;
    spyIntelligenceAgencyDailyBuyBonus: number;
    spySatelliteDailyBuyBonus: number;
    spyBaseUnitCap: number;
    spyIntelligenceAgencyUnitCap: number;
    researchScoreByOrdinal: number[];
    projectScore: number;
    unitScoreByOrdinal: number[];
    unitScoreCappedAt50ByOrdinal: boolean[];
}

export interface BlitzNationRow {
    nationId: number;
    nationName: string;
    allianceId: number;
    allianceName: string;
    cities: number;
    unitsByMilitaryUnitOrdinal: number[];
    unitCapsByMilitaryUnitOrdinal: number[];
    unitsBoughtTodayByMilitaryUnitOrdinal: number[];
    avgInfraCents: number;
    beigeTurns: number;
    vmTurns: number;
    inactiveMinutes: number;
    activityBp: number;
    loginDayChangeBp: number;
    weeklyActivityBp: number;
    freeOffensiveSlots: number;
    freeDefensiveSlots: number;
    maxOffensiveSlots: number;
    policyOrdinal: number;
    projectBits: number;
    researchBits: number;
    activeOrdinal: number;
    resetHourUtc: number;
    resetHourUtcFallback: boolean;
    colorOrdinal: number;
}

export interface BlitzObjectiveSummary {
    scoreMean: number;
    scoreP10: number;
    scoreP50: number;
    scoreP90: number;
    sampleCount: number;
}

export interface BlitzPairLockout {
    declarerNationId: number;
    targetNationId: number;
    warId: number;
    active: boolean;
}

export interface BlitzPlanRequest {
    attackers: string;
    defenders: string;
    edits: BlitzDraftEdit[];
    plannedWars: BlitzPlannedWar[];
    sideModeOrdinal: number;
    rebuyModeOrdinal: number;
    objectiveOrdinal: number;
    turn1DeclarePolicyOrdinal: number;
    horizonTurns: number;
    includeExistingWars: boolean;
    assume5553Buildings: boolean;
    stochasticSeed: number;
    currentTurnOverride: number;
    excludedWarIds: number[];
    runAssignment: boolean;
    captureTrace: boolean;
}

export interface BlitzPlanResponse {
    currentTurn: number;
    horizonTurns: number;
    attackerNationIds: number[];
    defenderNationIds: number[];
    nations: BlitzNationRow[];
    outsiderNations: BlitzOutsiderNation[];
    existingWars: BlitzExistingWar[];
    pairLockouts: BlitzPairLockout[];
    legalEdges: BlitzLegalEdge[];
    assignments: BlitzAssignedWar[];
    warnings: BlitzPlanWarning[];
    diagnostics: PlannerDiagnostic[];
    objective: BlitzObjectiveSummary;
    trace: BlitzReplayTrace;
    rules: BlitzMilitaryRules;
}

export interface BlitzPlanWarning {
    codeOrdinal: number;
    attackerNationId: number;
    defenderNationId: number;
    warId: number;
}

export interface BlitzPlannedWar {
    declarerNationId: number;
    targetNationId: number;
    warTypeOrdinal: number;
    userPinned: boolean;
}

export interface BlitzReplayConcludedWar {
    declarerNationId: number;
    targetNationId: number;
    endStatusOrdinal: number;
}

export interface BlitzReplayDeclaredWar {
    declarerNationId: number;
    targetNationId: number;
    warTypeOrdinal: number;
    startTurn: number;
}

export interface BlitzReplayDelta {
    turn: number;
    nations: BlitzNationReplayState[];
    wars: BlitzWarReplayState[];
    declaredWars: BlitzReplayDeclaredWar[];
    concludedWars: BlitzReplayConcludedWar[];
}

export interface BlitzReplayFrame {
    currentTurn: number;
    nations: BlitzNationReplayState[];
    wars: BlitzWarReplayState[];
}

export interface BlitzNationReplayState {
    nationId: number;
    unitsByMilitaryUnitOrdinal: number[];
    cityInfra: number[];
    score: number;
    beigeTurns: number;
    resources: number[];
}

export interface BlitzReplayTrace {
    initialFrame: BlitzReplayFrame;
    deltas: BlitzReplayDelta[];
    warnings: BlitzPlanWarning[];
}

export interface BlitzWarReplayState {
    declarerNationId: number;
    targetNationId: number;
    warTypeOrdinal: number;
    startTurn: number;
    statusOrdinal: number;
    attackerMaps: number;
    defenderMaps: number;
    attackerResistance: number;
    defenderResistance: number;
    groundControlOwnerOrdinal: number;
    airSuperiorityOwnerOrdinal: number;
    blockadeOwnerOrdinal: number;
    attackerFortified: boolean;
    defenderFortified: boolean;
}

export interface WebTransferResult {
    status: string;
    status_msg: string;
    status_success: boolean;
    receiver_id: number;
    receiver_is_aa: boolean;
    receiver_name: string;
    messages: string[];
    amount: number[];
    note: string;
}

export interface WebUrl {
    url: string;
}

export interface WebValue {
    value: string;
}

export interface WebWarFinder {
}

export interface BlitzAssignment {
}

export interface AdHocPlan {
    attackerId: number;
    horizonTurns: number;
    recommendations: AdHocTargetRecommendation[];
    diagnostics: PlannerDiagnostic[];
    metadata: AdHocPlanMetadata;
}

export interface AdHocTargetRecommendation {
    attackerId: number;
    defenderId: number;
    objectiveScore: number;
    counterRisk: number;
    horizonTurns: number;
    scoreSummary: ScoreSummary;
}

export interface ScoreSummary {
    mean: number;
    p10: number;
    p50: number;
    p90: number;
    sampleCount: number;
}

export interface AvailabilityWindow {
    startTurn: number;
    endTurnInclusive: number;
}

export interface ScheduledAttacker {
    attacker: DBNationSnapshot;
    windows: AvailabilityWindow[];
}

export interface ScheduledBucketAssignment {
    startTurn: number;
    endTurnInclusive: number;
    availableAttackerIds: number[];
    eligibleAttackerIds: number[];
    assignment: BlitzAssignment;
}

export interface ScheduledTargetPlan {
    bucketSizeTurns: number;
    buckets: ScheduledBucketAssignment[];
    timingComparisons: ScheduledTimingComparison[];
    diagnostics: PlannerDiagnostic[];
}

export interface TaxExpenses {
    datasetId: number;
    total: TaxExpenseBracket;
    brackets: TaxExpenseBracket[];
    alliances: number[];
    taxRecordCount: number;
}

export interface WebPermission {
    message: string;
    success: boolean;
}

export interface MultiResult {
    network: { [index: string]: NetworkRow };
    trade: SameNetworkTrade[];
    nationId: number;
    dateFetched: number;
    bans: { [index: string]: string };
    nationNames: { [index: string]: string };
    allianceNames: { [index: string]: string };
}

export interface RankingResult {
    kind: RankingKind;
    keyType: RankingEntityType;
    keyIds: number[];
    valueColumns: RankingValueColumn[];
    sectionRanges: RankingSectionRange[];
    highlightedIds: number[];
    asOfMs: number;
}

export interface NetworkRow {
    id: number;
    lastAccessFromSharedIP: number;
    numberOfSharedIPs: number;
    lastActiveMs: number;
    allianceId: number;
    dateCreated: number;
}

export interface SameNetworkTrade {
    sellingNation: number;
    buyingNation: number;
    dateOffered: number;
    resource: ResourceType;
    amount: number;
    ppu: number;
}

export interface AdvMultiReport {
    nationId: number;
    nation: string;
    allianceId: number;
    alliance: string;
    age: number;
    cities: number;
    discord: string;
    discord_linked: boolean;
    irl_verified: boolean;
    customization: number;
    banned: boolean;
    lastActive: number;
    percentOnline: number;
    dateFetched: number;
    rows: AdvMultiRow[];
}

export interface AdvMultiRow {
    id: number;
    Nation: string;
    alliance_id: number;
    alliance: string;
    age: number;
    cities: number;
    shared_ips: number;
    shared_percent: number;
    shared_nation_percent: number;
    same_ip: boolean;
    banned: boolean;
    login_diff: number;
    same_activity_percent: number;
    percentOnline: number;
    discord: string;
    discord_linked: boolean;
    irl_verified: boolean;
    customization: number;
}

export interface RunHistorySnapshot {
    startTimesMs: number[];
    durationsMs: number[];
    outcomeCodes: any;
}

export interface TaskSummary {
    id: number;
    name: string;
    createdAtMs: number;
    intervalMs: number;
    running: boolean;
    currentRunStartMs: number;
    lastRunStartMs: number;
    lastRunEndMs: number;
    lastRunDurationMs: number;
    lastOutcome: number;
    totalRuns: number;
    totalSuccess: number;
    totalErrors: number;
    totalInterrupts: number;
    consecutiveFailures: number;
    lastSuccessAtMs: number;
    lastFailureAtMs: number;
    lastErrorClass: string;
    lastErrorMessage: string;
}

export interface ErrorSample {
    fingerprint: number;
    throwableClass: string;
    message: string;
    stackTrace: string;
    firstSeenAtMs: number;
    lastSeenAtMs: number;
    count: number;
}

export interface TaskList {
    values: TaskSummary[];
}

export interface TaskDetails {
    found: boolean;
    summary: TaskSummary;
    errors: ErrorSample[];
    sinceMs: number;
    history: RunHistorySnapshot;
}

export interface ConflictAlliances {
    alliance_names: { [index: string]: string };
    conflict_alliances: { [index: string]: number[][] };
}

export interface ConflictPosts {
    posts: { [index: string]: { [index: string]: any[] } };
}

export interface WebConflictStartDetection {
    conflictId: string;
    currentStartTurn: number;
    searchedFromTurn: number;
    appliedStartTurn: number;
    applied: boolean;
    token: string;
    candidates: Candidate[];
}

export interface WebVirtualConflict {
    id: string;
    name: string;
    category: string;
    date: number;
    end: number;
    wiki: string;
    cb: string;
    status: string;
    alliances: ConflictAlliances;
    posts: { [index: string]: any[][] };
}

export interface VirtualConflictMeta {
    nationId: number;
    uuid: string;
    dateModified: number;
}

export interface WebTreatyChanges {
    treaty_changes: WebTreatyChange[];
}

export interface WebCurrentTreaties {
    current_treaties: WebCurrentTreaty[];
}

export interface WebCoalitions {
    coalitions: WebCoalition[];
}

export interface WebRoleAliases {
    mappings: { [index: string]: { [index: string]: number } };
    invalid_role_ordinals: number[];
    allows_alliance: number[];
    requiresSettings: { [index: string]: number };
    discord_role_names: { [index: string]: string };
}

export interface WebSettingValidationCheapness {
    is_cheap: { [index: string]: boolean };
}

export interface WebSettingValidationErrors {
    errors: { [index: string]: string };
}

export interface WebAutoRoleRoles {
    alliance_roles: WebAllianceAutoRole[];
    city_roles: WebCityAutoRole[];
    tax_roles: WebTaxAutoRole[];
}

export interface WebAllianceAutoRole {
    role_id: number;
    name: string;
    color: number;
    alliance_id: number;
    duplicate_key: boolean;
}

export interface WebCityAutoRole {
    role_id: number;
    name: string;
    color: number;
    range_start: number;
    range_end: number;
    duplicate_key: boolean;
}

export interface WebTaxAutoRole {
    role_id: number;
    name: string;
    color: number;
    money_rate: number;
    rss_rate: number;
    duplicate_key: boolean;
}

export interface AutoRoleResult {
    sync?: AutoRoleSyncState;
    role_names: { [index: string]: string };
    create_roles: number[];
    rename_roles: { [index: string]: string };
    created_roles: number[];
    renamed_roles: { [index: string]: string };
    execution_issues: AutoRoleIssue[];
    result: AutoRoleMemberResult;
}

export interface AutoRoleBulkResult {
    sync?: AutoRoleSyncState;
    role_names: { [index: string]: string };
    create_roles: number[];
    rename_roles: { [index: string]: string };
    created_roles: number[];
    renamed_roles: { [index: string]: string };
    execution_issues: AutoRoleIssue[];
    results: AutoRoleMemberResult[];
    masked_non_members: AutoRoleMaskedMember[];
}

export interface AutoRoleMemberResult {
    user_id: number;
    username: string;
    display_name: string;
    nation_id?: number;
    alliance_id?: number;
    create_roles: number[];
    add_roles: number[];
    remove_roles: number[];
    nickname?: string;
    clear_nickname: boolean;
    issues: AutoRoleIssue[];
    added_roles: number[];
    removed_roles: number[];
    applied_nickname?: string;
    cleared_nickname: boolean;
    execution_issues: AutoRoleIssue[];
}

export interface AutoRoleMaskedMember {
    user_id: number;
    username: string;
    display_name: string;
    nation_id?: number;
    reason: UnmaskedReason;
}

export interface AutoRoleSyncState {
    nickname_mode: AutoNickOption;
    alliance_mask_mode: AutoRoleOption;
    alliance_rank?: Rank;
    top_x?: number;
    ally_gov_enabled: boolean;
    member_apps_enabled: boolean;
    registered_role?: number;
    masked_alliances: number[];
    alliance_ids: number[];
    ally_ids: number[];
    extension_ids: number[];
    alliance_roles: { [index: string]: number };
    city_roles: number[];
    tax_roles: TaxRole[];
    applicant_roles: { [index: string]: number };
    member_roles: { [index: string]: number };
    conditional_roles: ConditionalRole[];
}

export interface AutoRoleIssue {
    type: AutoRoleIssueType;
    role_id?: number;
    alliance_id?: number;
    nickname?: string;
    error_type?: string;
    detail?: string;
}

export interface WebTaxBracket {
    taxId: number;
    dateFetched: number;
    allianceId: number;
    name: string;
    moneyRate: number;
    rssRate: number;
}

export interface PlannerDiagnostic {
    codeOrdinal: number;
    severityOrdinal: number;
    nationRoleOrdinal: number;
    nationId: number;
}

export interface AdHocPlanMetadata {
    exactValidationDefault: boolean;
    runtimePreviewApplied: boolean;
}

export interface BlitzOutsiderNation {
    nationId: number;
    nationName: string;
    allianceId: number;
    allianceName: string;
}

export interface DBNationSnapshot {
}

export interface ScheduledTimingComparison {
    attackerId: number;
    currentBucketStartTurn: number;
    currentBucketEndTurnInclusive: number;
    currentObjectiveScore: number;
    waitBucketStartTurn: number;
    waitBucketEndTurnInclusive: number;
    waitObjectiveScore: number;
}

export interface RankingValueColumn {
    kind: RankingValueKind;
    format: RankingValueFormat;
    values: number[];
}

export interface RankingSectionRange {
    kind: RankingSectionKind;
    rowOffset: number;
    rowCount: number;
}

export interface Candidate {
    turn: number;
    coal1Nations: number;
    coal2Nations: number;
    coal1Declarations: number;
    coal2Declarations: number;
    totalDeclarations: number;
    coal1Alliances: AllianceSummary[];
    coal2Alliances: AllianceSummary[];
}

export interface WebTreatyChange {
    timestamp: number;
    action: string;
    treaty_type: string;
    from_alliance_id: number;
    to_alliance_id: number;
    turns_remaining: number;
}

export interface WebCurrentTreaty {
    treaty_type: string;
    from_alliance_id: number;
    to_alliance_id: number;
    turns_remaining: number;
}

export interface WebCoalition {
    name: string;
    members: WebCoalitionMember[];
}

export interface TaxRole {
    money_rate: number;
    rss_rate: number;
    role_id: number;
}

export interface ConditionalRole {
    filter: string;
    role_id: number;
}

export interface AllianceSummary {
    allianceId: number;
    allianceName: string;
    nations: number;
    declarations: number;
}

export interface WebCoalitionMember {
    id: number;
    name: string;
    deleted: boolean;
}

export type CacheType = "None" | "Cookie" | "LocalStorage" | "SessionStorage" | "Memory";

export type GraphType = "STACKED_BAR" | "SIDE_BY_SIDE_BAR" | "HORIZONTAL_BAR" | "LINE" | "STACKED_LINE" | "FILLED_LINE" | "SCATTER";

export type BlitzAssignedWarSource = "USER_PINNED" | "PLANNER";

export type BlitzObjective = "NET_DAMAGE" | "DAMAGE" | "MINIMUM_DAMAGE_RECEIVED" | "CONTROL" | "BALANCED";

export type BlitzRebuyMode = "CURRENT_BUYS" | "FULL_REBUYS" | "NO_REBUYS";

export type BlitzSideMode = "ATTACKERS_ONLY" | "DEFENDERS_ONLY" | "BOTH";

export type Turn1DeclarePolicy = "ATTACKERS_OPEN_THEN_FREE_DEFENDERS_COUNTER" | "BOTH_FREE";

export type BlitzWarningCode = "BELOW_WAR_RANGE" | "ABOVE_WAR_RANGE" | "UPDECLARE_TOO_STRONG" | "DEFENDER_SLOTTED" | "DEFENDER_SPY_SLOTTED" | "ATTACKER_INACTIVE" | "ATTACKER_VM" | "DEFENDER_INACTIVE" | "DEFENDER_VM" | "ATTACKER_AT_MAX_OFFENSIVES" | "UNKNOWN_NATION" | "DUPLICATE_NATION" | "NATION_ON_BOTH_SIDES" | "ACTIVE_PAIR_CONFLICT" | "BEIGE_DEFENDER" | "TREATY_BLOCKED" | "MANUAL_DECLARATION_REJECTED" | "MANUAL_DECLARATION_FORCED" | "OVERRIDE_INVALID" | "ALLIANCE_MISMATCH" | "TARGET_NOT_ENEMY" | "DUPLICATE_SHEET_COLUMN";

export type AutoRoleIssueType = "NOT_REGISTERED" | "MISSING_REGISTERED_ROLE_MAPPING" | "MISSING_REGISTERED_ROLE" | "AUTO_NICKNAME_DISABLED" | "PLANNING_FAILED" | "CREATE_ROLE_FAILED" | "ADD_ROLE_FAILED" | "REMOVE_ROLE_FAILED" | "RENAME_ROLE_FAILED" | "SET_NICKNAME_FAILED" | "CLEAR_NICKNAME_FAILED" | "ROLE_ALREADY_PRESENT" | "ROLE_NOT_PRESENT" | "ROLE_ALREADY_NAMED" | "NICKNAME_ALREADY_SET" | "NICKNAME_NOT_PRESENT";

export type UnmaskedReason = "NOT_REGISTERED" | "NOT_IN_ALLIANCE" | "APPLICANT" | "INACTIVE";

export type GuildSettingCategory = "DEFAULT" | "FOREIGN_AFFAIRS" | "WAR_ALERTS" | "BEIGE_ALERTS" | "ORBIS_ALERTS" | "WAR_ROOM" | "BANK_ACCESS" | "BANK_CONVERSION" | "BANK_OFFSHORE" | "BANK_GRANTS" | "BANK_INFO" | "TAX" | "AUDIT" | "SELF_ROLE" | "AUTO_ROLE" | "REWARD" | "RECRUIT" | "INTERVIEW" | "BOUNTY" | "TRADE" | "ARTIFICIAL_INTELLIGENCE";

export type GuildSettingSubgroup = "NONE" | "DEFENSIVE_WARS" | "OFFENSIVE_WARS" | "BEIGE_VIOLATIONS" | "ENEMY_ALERT" | "EXODUS_ALERT" | "ALLIANCE_GROUND_ALERT" | "MEMBER_WITHDRAWAL" | "BANK_LIMITS" | "GRANT_TEMPLATE_LIMIT" | "DEPOSIT_DISPLAY" | "GRANT_REQUESTS" | "TAX_SELF_ASSIGN" | "TAX_AUTO_ASSIGN" | "AUTO_AUDITS" | "MANUAL_AUDITS" | "SELF_ROLE" | "ROLE_SERVER_SYNC" | "ALLIANCE_ROLE" | "NATION_CREATION" | "ALLIANCE_APPLICATION";

export type TimeFormat = "NUMERIC" | "DECIMAL_ROUNDED" | "SI_UNIT" | "TURN_TO_DATE" | "DAYS_TO_DATE" | "MILLIS_TO_DATE" | "SECONDS_TO_DATE";

export type TableNumberFormat = "SI_UNIT" | "PERCENTAGE_ONE" | "PERCENTAGE_100" | "DECIMAL_ROUNDED";

export type RankingKind = "ALLIANCE_METRIC" | "ALLIANCE_ATTRIBUTE" | "ALLIANCE_METRIC_DELTA" | "ALLIANCE_LOOT" | "BASEBALL_GAMES" | "BASEBALL_CHALLENGE_GAMES" | "BASEBALL_EARNINGS" | "BASEBALL_CHALLENGE_EARNINGS" | "INCENTIVE" | "POTENTIAL_OFFSHORES" | "PROLIFIC_OFFSHORES" | "NATION_ATTRIBUTE" | "PRODUCTION" | "RECRUITMENT" | "TRADE_FLOW" | "TRADE_PROFIT" | "WAR_STATUS" | "WAR_COST" | "WAR_COUNT" | "ATTACK_TYPE";

export type RankingEntityType = "ALLIANCE" | "NATION";

export type ResourceType = "MONEY" | "CREDITS" | "FOOD" | "COAL" | "OIL" | "URANIUM" | "LEAD" | "IRON" | "BAUXITE" | "GASOLINE" | "MUNITIONS" | "STEEL" | "ALUMINUM";

export type AutoNickOption = "FALSE" | "LEADER" | "NATION" | "DISCORD" | "NICKNAME";

export type AutoRoleOption = "FALSE" | "ALL" | "ALLIES";

export type Rank = "LEADER" | "HEIR" | "OFFICER" | "MEMBER" | "APPLICANT" | "REMOVE" | "BAN" | "UNBAN" | "INVITE" | "UNINVITE";

export type RankingValueKind = "PRIMARY" | "AMOUNT" | "PRICE_PER_UNIT";

export type RankingValueFormat = "NUMBER" | "COUNT" | "MONEY" | "PERCENT";

export type RankingSectionKind = "ALLIANCES" | "NATIONS" | "INCENTIVE_REFERRERS" | "INCENTIVE_INTERVIEWERS" | "INCENTIVE_MENTORS" | "VICTORIES" | "LOSSES" | "EXPIRED" | "PEACE";
