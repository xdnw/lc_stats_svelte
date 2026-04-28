import { ApiEndpoint, type CommonEndpoint } from "./BulkQuery";
import type * as ApiTypes from "./apitypes";
export const REGISTER: CommonEndpoint<ApiTypes.WebSuccess, {confirm?: string}, {confirm?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.WebSuccess>(
        "register",
        "register",
        {"confirm":{"name":"confirm","type":"boolean"}},
        (data: unknown) => data as ApiTypes.WebSuccess,
        2592000,
        'None',
        "WebSuccess",
        `Register a new user mapping after confirmation`,
        true
    )
};

export const QUERY: CommonEndpoint<ApiTypes.WebBulkQuery, {queries?: string}, {queries?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.WebBulkQuery>(
        "query",
        "query",
        {"queries":{"name":"queries","type":"List\u003cEntry\u003cString,Map\u003cString,Object\u003e\u003e\u003e"}},
        (data: unknown) => data as ApiTypes.WebBulkQuery,
        2592000,
        'None',
        "WebBulkQuery",
        `Execute a batch of API queries and return their results`,
        true
    )
};

export const SESSION: CommonEndpoint<ApiTypes.WebSession, Record<string, never>, Record<string, never>> = {
    endpoint: new ApiEndpoint<ApiTypes.WebSession>(
        "session",
        "session",
        {},
        (data: unknown) => data as ApiTypes.WebSession,
        2592000,
        'LocalStorage',
        "WebSession",
        `Retrieve the current web session information`,
        false
    )
};

export const COMMAND: CommonEndpoint<ApiTypes.WebViewCommand, {data?: string}, {data?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.WebViewCommand>(
        "command",
        "command",
        {"data":{"name":"data","type":"Map\u003cString,Object\u003e"}},
        (data: unknown) => data as ApiTypes.WebViewCommand,
        2592000,
        'None',
        "WebViewCommand",
        `Execute an arbitrary Web endpoint command string and capture output`,
        true
    )
};

export const UNREGISTER: CommonEndpoint<ApiTypes.WebValue, {confirm?: string}, {confirm?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.WebValue>(
        "unregister",
        "unregister",
        {"confirm":{"name":"confirm","type":"boolean"}},
        (data: unknown) => data as ApiTypes.WebValue,
        2592000,
        'None',
        "WebValue",
        `Unregister the current user from the system after confirmation`,
        true
    )
};

export const PERMISSION: CommonEndpoint<ApiTypes.WebPermission, {command?: string}, {command?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.WebPermission>(
        "permission",
        "permission",
        {"command":{"name":"command","type":"ICommand\u003c?\u003e"}},
        (data: unknown) => data as ApiTypes.WebPermission,
        2592000,
        'None',
        "WebPermission",
        `Check whether the given user and guild have permission for a command`,
        true
    )
};

export const LOGOUT: CommonEndpoint<ApiTypes.WebSuccess, Record<string, never>, Record<string, never>> = {
    endpoint: new ApiEndpoint<ApiTypes.WebSuccess>(
        "logout",
        "logout",
        {},
        (data: unknown) => data as ApiTypes.WebSuccess,
        2592000,
        'None',
        "WebSuccess",
        `Log out the current user and clear authentication cookies`,
        true
    )
};

export const LOGIN_MAIL: CommonEndpoint<ApiTypes.WebUrl, {nation?: string}, {nation?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.WebUrl>(
        "login_mail",
        "login_mail",
        {"nation":{"name":"nation","type":"DBNation"}},
        (data: unknown) => data as ApiTypes.WebUrl,
        2592000,
        'None',
        "WebUrl",
        `Get mail login URL for the specified nation`,
        true
    )
};

export const SET_TOKEN: CommonEndpoint<ApiTypes.WebSuccess, {token?: string, guild_id?: string}, {token?: string, guild_id?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.WebSuccess>(
        "set_token",
        "set_token",
        {"token":{"name":"token","type":"UUID"},"guild_id":{"name":"guild_id","optional":true,"type":"Long"}},
        (data: unknown) => data as ApiTypes.WebSuccess,
        2592000,
        'None',
        "WebSuccess",
        `Set authentication token cookie and optionally guild ID`,
        true
    )
};

export const SET_GUILD: CommonEndpoint<ApiTypes.SetGuild, {guild?: string}, {guild?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.SetGuild>(
        "set_guild",
        "set_guild",
        {"guild":{"name":"guild","type":"Guild"}},
        (data: unknown) => data as ApiTypes.SetGuild,
        2592000,
        'None',
        "SetGuild",
        `Select a guild for the session and return its basic info`,
        true
    )
};

export const UNSET_GUILD: CommonEndpoint<ApiTypes.WebSuccess, Record<string, never>, Record<string, never>> = {
    endpoint: new ApiEndpoint<ApiTypes.WebSuccess>(
        "unset_guild",
        "unset_guild",
        {},
        (data: unknown) => data as ApiTypes.WebSuccess,
        2592000,
        'None',
        "WebSuccess",
        `Clear the current guild selection cookie`,
        true
    )
};

export const SET_OAUTH_CODE: CommonEndpoint<ApiTypes.WebSuccess, {code?: string}, {code?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.WebSuccess>(
        "set_oauth_code",
        "set_oauth_code",
        {"code":{"name":"code","type":"String"}},
        (data: unknown) => data as ApiTypes.WebSuccess,
        2592000,
        'None',
        "WebSuccess",
        `Exchange OAuth code for an auth token and set session cookie`,
        true
    )
};

export const INPUT_OPTIONS: CommonEndpoint<ApiTypes.WebOptions, {type?: string}, {type?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.WebOptions>(
        "input_options",
        "input_options",
        {"type":{"name":"type","type":"String"}},
        (data: unknown) => data as ApiTypes.WebOptions,
        30,
        'LocalStorage',
        "WebOptions",
        `Fetch UI options for an input type based on current user/guild/nation context`,
        false
    )
};

export const TRADEPRICEBYDAYJSON: CommonEndpoint<ApiTypes.WebGraph, {resources?: string, days?: string}, {resources?: string, days?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.WebGraph>(
        "tradepricebydayjson",
        "tradePriceByDayJson",
        {"resources":{"name":"resources","type":"Set\u003cResourceType\u003e"},"days":{"name":"days","type":"int","min":1.0}},
        (data: unknown) => data as ApiTypes.WebGraph,
        2592000,
        'None',
        "WebGraph",
        `Graph average trade price per unit by day for given resources`,
        false
    )
};

export const RECORDS: CommonEndpoint<ApiTypes.WebTable, {nation?: string}, {nation?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.WebTable>(
        "records",
        "records",
        {"nation":{"name":"nation","optional":true,"type":"DBNation"}},
        (data: unknown) => data as ApiTypes.WebTable,
        2592000,
        'None',
        "WebTable",
        `Fetch bank transaction records for a nation`,
        false
    )
};

export const AUTOROLE: CommonEndpoint<ApiTypes.AutoRoleResult, {member?: string, force?: string}, {member?: string, force?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.AutoRoleResult>(
        "autorole",
        "autorole",
        {"member":{"name":"member","type":"Member"},"force":{"name":"force","optional":true,"flag":"f","type":"boolean"}},
        (data: unknown) => data as ApiTypes.AutoRoleResult,
        2592000,
        'None',
        "AutoRoleResult",
        `Preview or execute autorole for a guild member`,
        true
    )
};

export const AUTOROLEALL: CommonEndpoint<ApiTypes.AutoRoleBulkResult, {force?: string}, {force?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.AutoRoleBulkResult>(
        "autoroleall",
        "autoroleall",
        {"force":{"name":"force","optional":true,"flag":"f","type":"boolean"}},
        (data: unknown) => data as ApiTypes.AutoRoleBulkResult,
        2592000,
        'None',
        "AutoRoleBulkResult",
        `Preview or execute autorole for all guild members`,
        true
    )
};

export const WITHDRAW: CommonEndpoint<ApiTypes.WebTransferResult, {receiver?: string, amount?: string, note?: string}, {receiver?: string, amount?: string, note?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.WebTransferResult>(
        "withdraw",
        "withdraw",
        {"receiver":{"name":"receiver","type":"NationOrAlliance"},"amount":{"name":"amount","type":"Map\u003cResourceType,Double\u003e"},"note":{"name":"note","type":"DepositType"}},
        (data: unknown) => data as ApiTypes.WebTransferResult,
        2592000,
        'None',
        "WebTransferResult",
        `Withdraw funds from a nation bank account to another entity`,
        true
    )
};

export const ANNOUNCEMENTS: CommonEndpoint<ApiTypes.WebAnnouncements, Record<string, never>, Record<string, never>> = {
    endpoint: new ApiEndpoint<ApiTypes.WebAnnouncements>(
        "announcements",
        "announcements",
        {},
        (data: unknown) => data as ApiTypes.WebAnnouncements,
        30,
        'SessionStorage',
        "WebAnnouncements",
        `List player announcements for the current nation`,
        false
    )
};

export const BALANCE: CommonEndpoint<ApiTypes.WebBalance, {nation?: string}, {nation?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.WebBalance>(
        "balance",
        "balance",
        {"nation":{"name":"nation","optional":true,"type":"DBNation"}},
        (data: unknown) => data as ApiTypes.WebBalance,
        2592000,
        'None',
        "WebBalance",
        `Get bank balance breakdown for a nation`,
        false
    )
};

export const MY_WARS: CommonEndpoint<ApiTypes.WebMyWars, Record<string, never>, Record<string, never>> = {
    endpoint: new ApiEndpoint<ApiTypes.WebMyWars>(
        "my_wars",
        "my_wars",
        {},
        (data: unknown) => data as ApiTypes.WebMyWars,
        2592000,
        'None',
        "WebMyWars",
        `Retrieve summary of nation presently involved in the most wars`,
        false
    )
};

export const MY_AUDITS: CommonEndpoint<ApiTypes.WebAudits, Record<string, never>, Record<string, never>> = {
    endpoint: new ApiEndpoint<ApiTypes.WebAudits>(
        "my_audits",
        "my_audits",
        {},
        (data: unknown) => data as ApiTypes.WebAudits,
        30,
        'SessionStorage',
        "WebAudits",
        `Return IA audit results for the current nation`,
        false
    )
};

export const READ_ANNOUNCEMENT: CommonEndpoint<ApiTypes.WebSuccess, {ann_id?: string}, {ann_id?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.WebSuccess>(
        "read_announcement",
        "read_announcement",
        {"ann_id":{"name":"ann_id","type":"int"}},
        (data: unknown) => data as ApiTypes.WebSuccess,
        2592000,
        'None',
        "WebSuccess",
        `Mark a specific announcement as read`,
        true
    )
};

export const BANK_ACCESS: CommonEndpoint<ApiTypes.WebBankAccess, Record<string, never>, Record<string, never>> = {
    endpoint: new ApiEndpoint<ApiTypes.WebBankAccess>(
        "bank_access",
        "bank_access",
        {},
        (data: unknown) => data as ApiTypes.WebBankAccess,
        2592000,
        'None',
        "WebBankAccess",
        `Retrieve allowed bank accounts and access types`,
        false
    )
};

export const MARK_ALL_READ: CommonEndpoint<ApiTypes.WebSuccess, Record<string, never>, Record<string, never>> = {
    endpoint: new ApiEndpoint<ApiTypes.WebSuccess>(
        "mark_all_read",
        "mark_all_read",
        {},
        (data: unknown) => data as ApiTypes.WebSuccess,
        2592000,
        'None',
        "WebSuccess",
        `Mark all announcements as read`,
        true
    )
};

export const UNREAD_COUNT: CommonEndpoint<ApiTypes.WebInt, Record<string, never>, Record<string, never>> = {
    endpoint: new ApiEndpoint<ApiTypes.WebInt>(
        "unread_count",
        "unread_count",
        {},
        (data: unknown) => data as ApiTypes.WebInt,
        2592000,
        'None',
        "WebInt",
        `Return count of unread announcements`,
        false
    )
};

export const VIEW_ANNOUNCEMENT: CommonEndpoint<ApiTypes.WebAnnouncement, {ann_id?: string}, {ann_id?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.WebAnnouncement>(
        "view_announcement",
        "view_announcement",
        {"ann_id":{"name":"ann_id","type":"int"}},
        (data: unknown) => data as ApiTypes.WebAnnouncement,
        2592000,
        'SessionStorage',
        "WebAnnouncement",
        `View a specific announcement and mark it read`,
        false
    )
};

export const UNREAD_ANNOUNCEMENT: CommonEndpoint<ApiTypes.WebSuccess, {ann_id?: string}, {ann_id?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.WebSuccess>(
        "unread_announcement",
        "unread_announcement",
        {"ann_id":{"name":"ann_id","type":"int"}},
        (data: unknown) => data as ApiTypes.WebSuccess,
        2592000,
        'None',
        "WebSuccess",
        `Mark a single announcement as unread`,
        true
    )
};

export const ANNOUNCEMENT_TITLES: CommonEndpoint<ApiTypes.WebAnnouncements, {read?: string}, {read?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.WebAnnouncements>(
        "announcement_titles",
        "announcement_titles",
        {"read":{"name":"read","optional":true,"flag":"r","type":"boolean"}},
        (data: unknown) => data as ApiTypes.WebAnnouncements,
        2592000,
        'None',
        "WebAnnouncements",
        `Get announcement titles, optionally filtering by read state`,
        false
    )
};

export const TREASURE: CommonEndpoint<ApiTypes.WebTargets, {nation?: string, onlyWeaker?: string, ignoreDNR?: string, numResults?: string}, {nation?: string, onlyWeaker?: string, ignoreDNR?: string, numResults?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.WebTargets>(
        "treasure",
        "treasure",
        {"nation":{"name":"nation","optional":true,"type":"DBNation"},"onlyWeaker":{"name":"onlyWeaker","optional":true,"flag":"r","type":"boolean"},"ignoreDNR":{"name":"ignoreDNR","optional":true,"flag":"d","type":"boolean"},"numResults":{"name":"numResults","optional":true,"type":"int","def":"5"}},
        (data: unknown) => data as ApiTypes.WebTargets,
        2592000,
        'None',
        "WebTargets",
        `Find nations in war range that have a treasure`,
        false
    )
};

export const WAR: CommonEndpoint<ApiTypes.WebTargets, {nation?: string, nations?: string, numResults?: string, attackerScore?: string, includeInactives?: string, includeApplicants?: string, onlyPriority?: string, onlyWeak?: string, onlyEasy?: string, onlyLessCities?: string, includeStrong?: string}, {nation?: string, nations?: string, numResults?: string, attackerScore?: string, includeInactives?: string, includeApplicants?: string, onlyPriority?: string, onlyWeak?: string, onlyEasy?: string, onlyLessCities?: string, includeStrong?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.WebTargets>(
        "war",
        "war",
        {"nation":{"name":"nation","optional":true,"type":"DBNation"},"nations":{"name":"nations","optional":true,"type":"Set\u003cDBNation\u003e","def":"*"},"numResults":{"name":"numResults","optional":true,"type":"int","def":"8"},"attackerScore":{"name":"attackerScore","optional":true,"flag":"r","type":"Double"},"includeInactives":{"name":"includeInactives","optional":true,"flag":"i","type":"boolean"},"includeApplicants":{"name":"includeApplicants","optional":true,"flag":"a","type":"boolean"},"onlyPriority":{"name":"onlyPriority","optional":true,"flag":"p","type":"boolean"},"onlyWeak":{"name":"onlyWeak","optional":true,"flag":"w","type":"boolean"},"onlyEasy":{"name":"onlyEasy","optional":true,"flag":"e","type":"boolean"},"onlyLessCities":{"name":"onlyLessCities","optional":true,"flag":"c","type":"boolean"},"includeStrong":{"name":"includeStrong","optional":true,"flag":"s","type":"boolean"}},
        (data: unknown) => data as ApiTypes.WebTargets,
        2592000,
        'None',
        "WebTargets",
        `Find a war target that you can hit`,
        false
    )
};

export const BOUNTY: CommonEndpoint<ApiTypes.WebTargets, {nation?: string, onlyWeaker?: string, ignoreDNR?: string, bountyTypes?: string, numResults?: string}, {nation?: string, onlyWeaker?: string, ignoreDNR?: string, bountyTypes?: string, numResults?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.WebTargets>(
        "bounty",
        "bounty",
        {"nation":{"name":"nation","optional":true,"type":"DBNation"},"onlyWeaker":{"name":"onlyWeaker","optional":true,"flag":"r","type":"boolean"},"ignoreDNR":{"name":"ignoreDNR","optional":true,"flag":"d","type":"boolean"},"bountyTypes":{"name":"bountyTypes","optional":true,"flag":"b","type":"Set\u003cWarType\u003e"},"numResults":{"name":"numResults","optional":true,"type":"int","def":"5"}},
        (data: unknown) => data as ApiTypes.WebTargets,
        2592000,
        'None',
        "WebTargets",
        `Find nations with high bounties within your war range`,
        false
    )
};

export const DAMAGE: CommonEndpoint<ApiTypes.WebTargets, {nation?: string, nations?: string, includeApps?: string, includeInactives?: string, filterWeak?: string, noNavy?: string, targetMeanInfra?: string, targetCityMax?: string, targetBeigeMax?: string, includeBeige?: string, relativeNavalStrength?: string, warRange?: string, numResults?: string}, {nation?: string, nations?: string, includeApps?: string, includeInactives?: string, filterWeak?: string, noNavy?: string, targetMeanInfra?: string, targetCityMax?: string, targetBeigeMax?: string, includeBeige?: string, relativeNavalStrength?: string, warRange?: string, numResults?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.WebTargets>(
        "damage",
        "damage",
        {"nation":{"name":"nation","optional":true,"type":"DBNation"},"nations":{"name":"nations","optional":true,"type":"Set\u003cDBNation\u003e","def":"*"},"includeApps":{"name":"includeApps","optional":true,"flag":"a","type":"boolean"},"includeInactives":{"name":"includeInactives","optional":true,"flag":"i","type":"boolean"},"filterWeak":{"name":"filterWeak","optional":true,"flag":"w","type":"boolean"},"noNavy":{"name":"noNavy","optional":true,"flag":"n","type":"boolean"},"targetMeanInfra":{"name":"targetMeanInfra","optional":true,"flag":"m","type":"boolean"},"targetCityMax":{"name":"targetCityMax","optional":true,"flag":"c","type":"boolean"},"targetBeigeMax":{"name":"targetBeigeMax","optional":true,"flag":"tb","type":"boolean"},"includeBeige":{"name":"includeBeige","optional":true,"flag":"b","type":"boolean"},"relativeNavalStrength":{"name":"relativeNavalStrength","optional":true,"flag":"r","type":"Double"},"warRange":{"name":"warRange","optional":true,"flag":"s","type":"Double"},"numResults":{"name":"numResults","optional":true,"type":"int","def":"15"}},
        (data: unknown) => data as ApiTypes.WebTargets,
        2592000,
        'None',
        "WebTargets",
        `Find damage targets with infra-based sorting`,
        false
    )
};

export const RAID: CommonEndpoint<ApiTypes.WebTargets, {nation?: string, nations?: string, weak_ground?: string, vm_turns?: string, beige_turns?: string, ignore_dnr?: string, time_inactive?: string, min_loot?: string, num_results?: string}, {nation?: string, nations?: string, weak_ground?: string, vm_turns?: string, beige_turns?: string, ignore_dnr?: string, time_inactive?: string, min_loot?: string, num_results?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.WebTargets>(
        "raid",
        "raid",
        {"nation":{"name":"nation","optional":true,"type":"DBNation"},"nations":{"name":"nations","optional":true,"type":"Set\u003cDBNation\u003e","def":"*,#position\u003c\u003d1"},"weak_ground":{"name":"weak_ground","optional":true,"type":"boolean","def":"false"},"vm_turns":{"name":"vm_turns","optional":true,"type":"int","def":"0"},"beige_turns":{"name":"beige_turns","optional":true,"type":"int","def":"0"},"ignore_dnr":{"name":"ignore_dnr","optional":true,"type":"boolean","def":"false"},"time_inactive":{"name":"time_inactive","optional":true,"type":"long[Timediff]","def":"7d"},"min_loot":{"name":"min_loot","optional":true,"type":"double","def":"-1"},"num_results":{"name":"num_results","optional":true,"type":"int","def":"8"}},
        (data: unknown) => data as ApiTypes.WebTargets,
        30,
        'SessionStorage',
        "WebTargets",
        `Compute raid targets based on provided parameters`,
        false
    )
};

export const UNPROTECTED: CommonEndpoint<ApiTypes.WebTargets, {nation?: string, nations?: string, includeAllies?: string, ignoreODP?: string, ignore_dnr?: string, maxRelativeTargetStrength?: string, maxRelativeCounterStrength?: string, num_results?: string}, {nation?: string, nations?: string, includeAllies?: string, ignoreODP?: string, ignore_dnr?: string, maxRelativeTargetStrength?: string, maxRelativeCounterStrength?: string, num_results?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.WebTargets>(
        "unprotected",
        "unprotected",
        {"nation":{"name":"nation","optional":true,"type":"DBNation"},"nations":{"name":"nations","optional":true,"type":"Set\u003cDBNation\u003e","def":"*"},"includeAllies":{"name":"includeAllies","optional":true,"flag":"a","type":"boolean"},"ignoreODP":{"name":"ignoreODP","optional":true,"flag":"o","type":"boolean"},"ignore_dnr":{"name":"ignore_dnr","optional":true,"type":"boolean","def":"false"},"maxRelativeTargetStrength":{"name":"maxRelativeTargetStrength","optional":true,"flag":"s","desc":"The maximum allowed military strength of the target nation relative to you","type":"Double","def":"1.2"},"maxRelativeCounterStrength":{"name":"maxRelativeCounterStrength","optional":true,"flag":"c","desc":"The maximum allowed military strength of counters relative to you","type":"Double","def":"1.2"},"num_results":{"name":"num_results","optional":true,"desc":"Only list targets within range of ALL attackers","type":"int","def":"8"}},
        (data: unknown) => data as ApiTypes.WebTargets,
        2592000,
        'None',
        "WebTargets",
        `List unprotected counter targets with various filters`,
        false
    )
};

export const SPYOPS: CommonEndpoint<ApiTypes.WebSpyTargets, {attacker?: string, targets?: string, operations?: string, requiredSuccess?: string, prioritizeKills?: string, numResults?: string}, {attacker?: string, targets?: string, operations?: string, requiredSuccess?: string, prioritizeKills?: string, numResults?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.WebSpyTargets>(
        "spyops",
        "spyops",
        {"attacker":{"name":"attacker","optional":true,"type":"DBNation"},"targets":{"name":"targets","optional":true,"type":"Set\u003cDBNation\u003e","def":"*"},"operations":{"name":"operations","optional":true,"type":"Set\u003cOperation\u003e","def":"*"},"requiredSuccess":{"name":"requiredSuccess","optional":true,"type":"int","def":"40","min":0.0,"max":100.0},"prioritizeKills":{"name":"prioritizeKills","optional":true,"type":"boolean","def":"false"},"numResults":{"name":"numResults","optional":true,"type":"int","def":"5","min":1.0,"max":25.0}},
        (data: unknown) => data as ApiTypes.WebSpyTargets,
        30,
        'SessionStorage',
        "WebSpyTargets",
        `Compute the best spy ops for a target set`,
        false
    )
};

export const INTEL: CommonEndpoint<ApiTypes.WebSpyTargets, {attacker?: string, dnrTopX?: string, ignoreDNR?: string, score?: string, numResults?: string}, {attacker?: string, dnrTopX?: string, ignoreDNR?: string, score?: string, numResults?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.WebSpyTargets>(
        "intel",
        "intel",
        {"attacker":{"name":"attacker","optional":true,"type":"DBNation"},"dnrTopX":{"name":"dnrTopX","optional":true,"type":"Integer"},"ignoreDNR":{"name":"ignoreDNR","optional":true,"type":"boolean","def":"false"},"score":{"name":"score","optional":true,"type":"Double"},"numResults":{"name":"numResults","optional":true,"type":"int","def":"8","min":1.0,"max":25.0}},
        (data: unknown) => data as ApiTypes.WebSpyTargets,
        30,
        'SessionStorage',
        "WebSpyTargets",
        `Find nations to gather intel on`,
        false
    )
};

export const BLITZPLAN: CommonEndpoint<ApiTypes.BlitzPlanResponse, {request?: string}, {request?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.BlitzPlanResponse>(
        "blitzplan",
        "blitzPlan",
        {"request":{"name":"request","type":"BlitzPlanRequest"}},
        (data: unknown) => data as ApiTypes.BlitzPlanResponse,
        30,
        'SessionStorage',
        "BlitzPlanResponse",
        `Plan, validate, or run blitz assignment`,
        false
    )
};

export const SIMADHOC: CommonEndpoint<ApiTypes.WebSimAdHocPlan, {attacker?: string, defenders?: string, numResults?: string, horizonTurns?: string, stochastic?: string, stochasticSamples?: string, stochasticSeed?: string}, {attacker?: string, defenders?: string, numResults?: string, horizonTurns?: string, stochastic?: string, stochasticSamples?: string, stochasticSeed?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.WebSimAdHocPlan>(
        "simadhoc",
        "simAdhoc",
        {"attacker":{"name":"attacker","optional":true,"type":"DBNation"},"defenders":{"name":"defenders","optional":true,"type":"Set\u003cDBNation\u003e","def":"*"},"numResults":{"name":"numResults","optional":true,"type":"int","def":"8"},"horizonTurns":{"name":"horizonTurns","optional":true,"type":"int","def":"6"},"stochastic":{"name":"stochastic","optional":true,"type":"boolean","def":"false"},"stochasticSamples":{"name":"stochasticSamples","optional":true,"type":"int","def":"16"},"stochasticSeed":{"name":"stochasticSeed","optional":true,"type":"long","def":"1"}},
        (data: unknown) => data as ApiTypes.WebSimAdHocPlan,
        30,
        'SessionStorage',
        "WebSimAdHocPlan",
        `Rank ad-hoc targets for one attacker over a short deterministic horizon`,
        false
    )
};

export const SIMBLITZ: CommonEndpoint<ApiTypes.BlitzAssignment, {attackers?: string, defenders?: string, stochastic?: string, stochasticSamples?: string, stochasticSeed?: string}, {attackers?: string, defenders?: string, stochastic?: string, stochasticSamples?: string, stochasticSeed?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.BlitzAssignment>(
        "simblitz",
        "simBlitz",
        {"attackers":{"name":"attackers","optional":true,"type":"Set\u003cDBNation\u003e","def":"*"},"defenders":{"name":"defenders","optional":true,"type":"Set\u003cDBNation\u003e","def":"*"},"stochastic":{"name":"stochastic","optional":true,"type":"boolean","def":"false"},"stochasticSamples":{"name":"stochasticSamples","optional":true,"type":"int","def":"16"},"stochasticSeed":{"name":"stochasticSeed","optional":true,"type":"long","def":"1"}},
        (data: unknown) => data as ApiTypes.BlitzAssignment,
        30,
        'SessionStorage',
        "BlitzAssignment",
        `Run the blitz planner on a fixed attacker and defender set`,
        false
    )
};

export const SIMSCHEDULE: CommonEndpoint<ApiTypes.ScheduledTargetPlan, {attackers?: string, defenders?: string, availability?: string, bucketSizeTurns?: string, stochastic?: string, stochasticSamples?: string, stochasticSeed?: string}, {attackers?: string, defenders?: string, availability?: string, bucketSizeTurns?: string, stochastic?: string, stochasticSamples?: string, stochasticSeed?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.ScheduledTargetPlan>(
        "simschedule",
        "simSchedule",
        {"attackers":{"name":"attackers","optional":true,"type":"Set\u003cDBNation\u003e","def":"*"},"defenders":{"name":"defenders","optional":true,"type":"Set\u003cDBNation\u003e","def":"*"},"availability":{"name":"availability","optional":true,"type":"String","def":""},"bucketSizeTurns":{"name":"bucketSizeTurns","optional":true,"type":"int","def":"6"},"stochastic":{"name":"stochastic","optional":true,"type":"boolean","def":"false"},"stochasticSamples":{"name":"stochasticSamples","optional":true,"type":"int","def":"16"},"stochasticSeed":{"name":"stochasticSeed","optional":true,"type":"long","def":"1"}},
        (data: unknown) => data as ApiTypes.ScheduledTargetPlan,
        30,
        'SessionStorage',
        "ScheduledTargetPlan",
        `Plan rolling scheduled blitz buckets from per-attacker availability windows`,
        false
    )
};

export const SETTINGS_VALIDATION_CHEAPNESS: CommonEndpoint<ApiTypes.WebSettingValidationCheapness, {settings?: string}, {settings?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.WebSettingValidationCheapness>(
        "settings_validation_cheapness",
        "settings_validation_cheapness",
        {"settings":{"name":"settings","type":"Set\u003cGuildSetting\u003e"}},
        (data: unknown) => data as ApiTypes.WebSettingValidationCheapness,
        2592000,
        'None',
        "WebSettingValidationCheapness",
        `Report whether selected guild settings can be revalidated without expensive remote calls`,
        false
    )
};

export const SETTINGS_VALIDATION_ERRORS: CommonEndpoint<ApiTypes.WebSettingValidationErrors, {settings?: string}, {settings?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.WebSettingValidationErrors>(
        "settings_validation_errors",
        "settings_validation_errors",
        {"settings":{"name":"settings","type":"Set\u003cGuildSetting\u003e"}},
        (data: unknown) => data as ApiTypes.WebSettingValidationErrors,
        2592000,
        'None',
        "WebSettingValidationErrors",
        `Validate the current local values for selected guild settings; missing keys are valid or unset`,
        false
    )
};

export const LOCUTUS_TASK: CommonEndpoint<ApiTypes.TaskDetails, {id?: string}, {id?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.TaskDetails>(
        "locutus_task",
        "locutus_task",
        {"id":{"name":"id","type":"int"}},
        (data: unknown) => data as ApiTypes.TaskDetails,
        15,
        'SessionStorage',
        "TaskDetails",
        `Get detailed information and recent history for a specific repeating task`,
        false
    )
};

export const LOCUTUS_TASKS: CommonEndpoint<ApiTypes.TaskList, Record<string, never>, Record<string, never>> = {
    endpoint: new ApiEndpoint<ApiTypes.TaskList>(
        "locutus_tasks",
        "locutus_tasks",
        {},
        (data: unknown) => data as ApiTypes.TaskList,
        15,
        'SessionStorage',
        "TaskList",
        `List repeating tasks, hiding errors for non-admins`,
        false
    )
};

export const TABLE: CommonEndpoint<ApiTypes.WebTable, {type?: string, selection_str?: string, columns?: string[] | string}, {type?: string, selection_str?: string, columns?: string[] | string}> = {
    endpoint: new ApiEndpoint<ApiTypes.WebTable>(
        "table",
        "table",
        {"type":{"name":"type","type":"Class\u003c?\u003e[PlaceholderType]"},"selection_str":{"name":"selection_str","type":"String"},"columns":{"name":"columns","type":"List\u003cString\u003e[TextArea]"}},
        (data: unknown) => data as ApiTypes.WebTable,
        2592000,
        'None',
        "WebTable",
        `Render a custom WebTable using a placeholder type and specified columns`,
        false
    )
};

export const WARSBETWEEN: CommonEndpoint<ApiTypes.WebTable, {sideA?: string, sideB?: string, columns?: string[] | string, startTime?: string, endTime?: string, includeInactiveWars?: string, allowedWarTypes?: string, allowedWarStatuses?: string, onlyOffensiveWars?: string, onlyDefensiveWars?: string}, {sideA?: string, sideB?: string, columns?: string[] | string, startTime?: string, endTime?: string, includeInactiveWars?: string, allowedWarTypes?: string, allowedWarStatuses?: string, onlyOffensiveWars?: string, onlyDefensiveWars?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.WebTable>(
        "warsbetween",
        "warsBetween",
        {"sideA":{"name":"sideA","optional":true,"type":"Set\u003cNationOrAlliance\u003e","def":"*"},"sideB":{"name":"sideB","optional":true,"type":"Set\u003cNationOrAlliance\u003e","def":"*"},"columns":{"name":"columns","type":"List\u003cString\u003e[TextArea]"},"startTime":{"name":"startTime","optional":true,"flag":"start","type":"Long[Timestamp]"},"endTime":{"name":"endTime","optional":true,"flag":"end","type":"Long[Timestamp]"},"includeInactiveWars":{"name":"includeInactiveWars","optional":true,"flag":"inactive","type":"boolean"},"allowedWarTypes":{"name":"allowedWarTypes","optional":true,"flag":"wartype","type":"Set\u003cWarType\u003e"},"allowedWarStatuses":{"name":"allowedWarStatuses","optional":true,"flag":"status","type":"Set\u003cWarStatus\u003e"},"onlyOffensiveWars":{"name":"onlyOffensiveWars","optional":true,"flag":"off","type":"boolean"},"onlyDefensiveWars":{"name":"onlyDefensiveWars","optional":true,"flag":"def","type":"boolean"}},
        (data: unknown) => data as ApiTypes.WebTable,
        2592000,
        'None',
        "WebTable",
        `Render wars between two selected nation or alliance coalitions as a WebTable`,
        false
    )
};

export const WARSINVOLVING: CommonEndpoint<ApiTypes.WebTable, {coalition1?: string, columns?: string[] | string, startTime?: string, endTime?: string, includeInactiveWars?: string, allowedWarTypes?: string, allowedWarStatuses?: string, onlyOffensiveWars?: string, onlyDefensiveWars?: string}, {coalition1?: string, columns?: string[] | string, startTime?: string, endTime?: string, includeInactiveWars?: string, allowedWarTypes?: string, allowedWarStatuses?: string, onlyOffensiveWars?: string, onlyDefensiveWars?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.WebTable>(
        "warsinvolving",
        "warsInvolving",
        {"coalition1":{"name":"coalition1","optional":true,"type":"Set\u003cNationOrAlliance\u003e","def":"*"},"columns":{"name":"columns","type":"List\u003cString\u003e[TextArea]"},"startTime":{"name":"startTime","optional":true,"flag":"start","type":"Long[Timestamp]"},"endTime":{"name":"endTime","optional":true,"flag":"end","type":"Long[Timestamp]"},"includeInactiveWars":{"name":"includeInactiveWars","optional":true,"flag":"inactive","type":"boolean"},"allowedWarTypes":{"name":"allowedWarTypes","optional":true,"flag":"wartype","type":"Set\u003cWarType\u003e"},"allowedWarStatuses":{"name":"allowedWarStatuses","optional":true,"flag":"status","type":"Set\u003cWarStatus\u003e"},"onlyOffensiveWars":{"name":"onlyOffensiveWars","optional":true,"flag":"off","type":"boolean"},"onlyDefensiveWars":{"name":"onlyDefensiveWars","optional":true,"flag":"def","type":"boolean"}},
        (data: unknown) => data as ApiTypes.WebTable,
        2592000,
        'None',
        "WebTable",
        `Render wars involving any selected nations or alliances as a WebTable`,
        false
    )
};

export const CONFLICTALLIANCES: CommonEndpoint<ApiTypes.ConflictAlliances, {conflicts?: string}, {conflicts?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.ConflictAlliances>(
        "conflictalliances",
        "conflictAlliances",
        {"conflicts":{"name":"conflicts","type":"Set\u003cConflict\u003e"}},
        (data: unknown) => data as ApiTypes.ConflictAlliances,
        2592000,
        'None',
        "ConflictAlliances",
        `Fetch alliance names and participant lists for given conflicts`,
        false
    )
};

export const DETECTCONFLICTSTART: CommonEndpoint<ApiTypes.WebConflictStartDetection, {conflict?: string, turn_allowance?: string, force?: string, token?: string, candidate_turn?: string}, {conflict?: string, turn_allowance?: string, force?: string, token?: string, candidate_turn?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.WebConflictStartDetection>(
        "detectconflictstart",
        "detectConflictStart",
        {"conflict":{"name":"conflict","type":"Conflict"},"turn_allowance":{"name":"turn_allowance","optional":true,"flag":"t","type":"Integer"},"force":{"name":"force","optional":true,"flag":"f","type":"boolean"},"token":{"name":"token","optional":true,"flag":"k","type":"UUID"},"candidate_turn":{"name":"candidate_turn","optional":true,"flag":"c","type":"Long"}},
        (data: unknown) => data as ApiTypes.WebConflictStartDetection,
        2592000,
        'None',
        "WebConflictStartDetection",
        `Scan declared wars to produce nearby candidate start turns for a conflict.

With \`force=false\` (or omitted): runs detection, stores a token, and
returns nearby qualifying candidate turns without mutating the conflict.
The trigger is at least three distinct attacker nations on one side
declaring onto the opposing coalition during that turn.

With \`force=true\`: applies a previously surfaced candidate using the
supplied token and optional \`candidate_turn\`, without recomputing.`,
        true
    )
};

export const VIRTUALCONFLICTINFO: CommonEndpoint<ApiTypes.WebVirtualConflict, {conflict?: string}, {conflict?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.WebVirtualConflict>(
        "virtualconflictinfo",
        "virtualConflictInfo",
        {"conflict":{"name":"conflict","type":"Conflict"}},
        (data: unknown) => data as ApiTypes.WebVirtualConflict,
        2592000,
        'None',
        "WebVirtualConflict",
        `Retrieve detailed information about a specific temporary conflict`,
        false
    )
};

export const REMOVEVIRTUALCONFLICT: CommonEndpoint<ApiTypes.WebSuccess, {conflict?: string}, {conflict?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.WebSuccess>(
        "removevirtualconflict",
        "removeVirtualConflict",
        {"conflict":{"name":"conflict","type":"Conflict"}},
        (data: unknown) => data as ApiTypes.WebSuccess,
        2592000,
        'None',
        "WebSuccess",
        `Delete a specified temporary conflict if the caller has appropriate permissions`,
        true
    )
};

export const VIRTUALCONFLICTS: CommonEndpoint<ApiTypes.VirtualConflictMeta[], {all?: string}, {all?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.VirtualConflictMeta[]>(
        "virtualconflicts",
        "virtualConflicts",
        {"all":{"name":"all","optional":true,"flag":"a","type":"boolean"}},
        (data: unknown) => data as ApiTypes.VirtualConflictMeta[],
        2592000,
        'None',
        "VirtualConflictMeta[]",
        `List temporary virtual conflicts accessible to the current user`,
        false
    )
};

export const CONFLICTPOSTS: CommonEndpoint<ApiTypes.ConflictPosts, {conflicts?: string}, {conflicts?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.ConflictPosts>(
        "conflictposts",
        "conflictPosts",
        {"conflicts":{"name":"conflicts","type":"Set\u003cConflict\u003e"}},
        (data: unknown) => data as ApiTypes.ConflictPosts,
        2592000,
        'None',
        "ConflictPosts",
        `Fetch forum announcement posts for given conflicts`,
        false
    )
};

export const GLOBALSTATS: CommonEndpoint<ApiTypes.CoalitionGraphs, {metrics?: string, start?: string, end?: string, topX?: string}, {metrics?: string, start?: string, end?: string, topX?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.CoalitionGraphs>(
        "globalstats",
        "globalStats",
        {"metrics":{"name":"metrics","type":"Set\u003cAllianceMetric\u003e"},"start":{"name":"start","type":"long[Timestamp]"},"end":{"name":"end","type":"long[Timestamp]"},"topX":{"name":"topX","type":"int"}},
        (data: unknown) => data as ApiTypes.CoalitionGraphs,
        2592000,
        'None',
        "CoalitionGraphs",
        `Generate coalition graphs for specified metrics across spheres`,
        false
    )
};

export const GLOBALTIERSTATS: CommonEndpoint<ApiTypes.CoalitionGraphs, {metrics?: string, topX?: string, groupBy?: string, total?: string}, {metrics?: string, topX?: string, groupBy?: string, total?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.CoalitionGraphs>(
        "globaltierstats",
        "globalTierStats",
        {"metrics":{"name":"metrics","type":"Set\u003cTypedFunction\u003cDBNation,Double\u003e\u003e"},"topX":{"name":"topX","type":"int"},"groupBy":{"name":"groupBy","optional":true,"type":"TypedFunction\u003cDBNation,Double\u003e","def":"getCities"},"total":{"name":"total","optional":true,"flag":"t","type":"boolean"}},
        (data: unknown) => data as ApiTypes.CoalitionGraphs,
        2592000,
        'None',
        "CoalitionGraphs",
        `Generate tiered coalition graphs with custom grouping for nation metrics`,
        false
    )
};

export const COMPARESTATS: CommonEndpoint<ApiTypes.WebGraph, {metric?: string, start?: string, end?: string, coalition1?: string, coalition2?: string, coalition3?: string, coalition4?: string, coalition5?: string, coalition6?: string, coalition7?: string, coalition8?: string, coalition9?: string, coalition10?: string}, {metric?: string, start?: string, end?: string, coalition1?: string, coalition2?: string, coalition3?: string, coalition4?: string, coalition5?: string, coalition6?: string, coalition7?: string, coalition8?: string, coalition9?: string, coalition10?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.WebGraph>(
        "comparestats",
        "compareStats",
        {"metric":{"name":"metric","type":"AllianceMetric"},"start":{"name":"start","type":"long[Timestamp]"},"end":{"name":"end","type":"long[Timestamp]"},"coalition1":{"name":"coalition1","type":"Set\u003cDBAlliance\u003e"},"coalition2":{"name":"coalition2","type":"Set\u003cDBAlliance\u003e"},"coalition3":{"name":"coalition3","optional":true,"type":"Set\u003cDBAlliance\u003e"},"coalition4":{"name":"coalition4","optional":true,"type":"Set\u003cDBAlliance\u003e"},"coalition5":{"name":"coalition5","optional":true,"type":"Set\u003cDBAlliance\u003e"},"coalition6":{"name":"coalition6","optional":true,"type":"Set\u003cDBAlliance\u003e"},"coalition7":{"name":"coalition7","optional":true,"type":"Set\u003cDBAlliance\u003e"},"coalition8":{"name":"coalition8","optional":true,"type":"Set\u003cDBAlliance\u003e"},"coalition9":{"name":"coalition9","optional":true,"type":"Set\u003cDBAlliance\u003e"},"coalition10":{"name":"coalition10","optional":true,"type":"Set\u003cDBAlliance\u003e"}},
        (data: unknown) => data as ApiTypes.WebGraph,
        2592000,
        'None',
        "WebGraph",
        `Compare the stats of up to 10 alliances/coalitions on a single time graph`,
        false
    )
};

export const ALLIANCESTATS: CommonEndpoint<ApiTypes.WebGraph, {metrics?: string, start?: string, end?: string, coalition?: string}, {metrics?: string, start?: string, end?: string, coalition?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.WebGraph>(
        "alliancestats",
        "allianceStats",
        {"metrics":{"name":"metrics","type":"Set\u003cAllianceMetric\u003e"},"start":{"name":"start","type":"long[Timestamp]"},"end":{"name":"end","type":"long[Timestamp]"},"coalition":{"name":"coalition","type":"Set\u003cDBAlliance\u003e"}},
        (data: unknown) => data as ApiTypes.WebGraph,
        2592000,
        'None',
        "WebGraph",
        `Generate alliance-specific metric graph over a time range`,
        false
    )
};

export const COMPARETIERSTATS: CommonEndpoint<ApiTypes.WebGraph, {metric?: string, groupBy?: string, coalition1?: string, coalition2?: string, coalition3?: string, coalition4?: string, coalition5?: string, coalition6?: string, coalition7?: string, coalition8?: string, coalition9?: string, coalition10?: string, total?: string, includeApps?: string, includeVm?: string, includeInactive?: string, snapshotDate?: string}, {metric?: string, groupBy?: string, coalition1?: string, coalition2?: string, coalition3?: string, coalition4?: string, coalition5?: string, coalition6?: string, coalition7?: string, coalition8?: string, coalition9?: string, coalition10?: string, total?: string, includeApps?: string, includeVm?: string, includeInactive?: string, snapshotDate?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.WebGraph>(
        "comparetierstats",
        "compareTierStats",
        {"metric":{"name":"metric","type":"TypedFunction\u003cDBNation,Double\u003e"},"groupBy":{"name":"groupBy","type":"TypedFunction\u003cDBNation,Double\u003e"},"coalition1":{"name":"coalition1","type":"Set\u003cDBNation\u003e"},"coalition2":{"name":"coalition2","optional":true,"type":"Set\u003cDBNation\u003e"},"coalition3":{"name":"coalition3","optional":true,"type":"Set\u003cDBNation\u003e"},"coalition4":{"name":"coalition4","optional":true,"type":"Set\u003cDBNation\u003e"},"coalition5":{"name":"coalition5","optional":true,"type":"Set\u003cDBNation\u003e"},"coalition6":{"name":"coalition6","optional":true,"type":"Set\u003cDBNation\u003e"},"coalition7":{"name":"coalition7","optional":true,"type":"Set\u003cDBNation\u003e"},"coalition8":{"name":"coalition8","optional":true,"type":"Set\u003cDBNation\u003e"},"coalition9":{"name":"coalition9","optional":true,"type":"Set\u003cDBNation\u003e"},"coalition10":{"name":"coalition10","optional":true,"type":"Set\u003cDBNation\u003e"},"total":{"name":"total","optional":true,"flag":"t","type":"boolean"},"includeApps":{"name":"includeApps","optional":true,"flag":"a","type":"boolean"},"includeVm":{"name":"includeVm","optional":true,"flag":"v","type":"boolean"},"includeInactive":{"name":"includeInactive","optional":true,"flag":"i","type":"boolean"},"snapshotDate":{"name":"snapshotDate","optional":true,"flag":"s","type":"Long[Timestamp]"}},
        (data: unknown) => data as ApiTypes.WebGraph,
        2592000,
        'None',
        "WebGraph",
        `Compare the tier stats of up to 10 alliances/nations on a single graph`,
        false
    )
};

export const STRENGTHTIERGRAPH: CommonEndpoint<ApiTypes.WebGraph, {coalition1?: string, coalition2?: string, includeInactives?: string, includeApplicants?: string, col1MMR?: string, col2MMR?: string, col1Infra?: string, col2Infra?: string, snapshotDate?: string}, {coalition1?: string, coalition2?: string, includeInactives?: string, includeApplicants?: string, col1MMR?: string, col2MMR?: string, col1Infra?: string, col2Infra?: string, snapshotDate?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.WebGraph>(
        "strengthtiergraph",
        "strengthTierGraph",
        {"coalition1":{"name":"coalition1","type":"Set\u003cDBNation\u003e"},"coalition2":{"name":"coalition2","type":"Set\u003cDBNation\u003e"},"includeInactives":{"name":"includeInactives","optional":true,"flag":"i","type":"boolean"},"includeApplicants":{"name":"includeApplicants","optional":true,"flag":"n","type":"boolean"},"col1MMR":{"name":"col1MMR","optional":true,"flag":"a","desc":"Use the score/strength of coalition 1 nations at specific military unit levels","type":"MMRDouble"},"col2MMR":{"name":"col2MMR","optional":true,"flag":"b","desc":"Use the score/strength of coalition 2 nations at specific military unit levels","type":"MMRDouble"},"col1Infra":{"name":"col1Infra","optional":true,"flag":"c","desc":"Use the score of coalition 1 nations at specific average infrastructure levels","type":"Double"},"col2Infra":{"name":"col2Infra","optional":true,"flag":"d","desc":"Use the score of coalition 2 nations at specific average infrastructure levels","type":"Double"},"snapshotDate":{"name":"snapshotDate","optional":true,"flag":"s","type":"Long[Timestamp]"}},
        (data: unknown) => data as ApiTypes.WebGraph,
        2592000,
        'None',
        "WebGraph",
        `Generate a graph of nation military strength by score between two coalitions
1 tank = 1/32 aircraft for strength calculations
Effective score range is limited to 1.75x with a linear reduction of strength up to 40% to account for up-declares`,
        false
    )
};

export const CITYTIERGRAPH: CommonEndpoint<ApiTypes.WebGraph, {coalition1?: string, coalition2?: string, includeInactives?: string, barGraph?: string, includeApplicants?: string, snapshotDate?: string}, {coalition1?: string, coalition2?: string, includeInactives?: string, barGraph?: string, includeApplicants?: string, snapshotDate?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.WebGraph>(
        "citytiergraph",
        "cityTierGraph",
        {"coalition1":{"name":"coalition1","type":"Set\u003cDBNation\u003e"},"coalition2":{"name":"coalition2","type":"Set\u003cDBNation\u003e"},"includeInactives":{"name":"includeInactives","optional":true,"flag":"i","type":"boolean"},"barGraph":{"name":"barGraph","optional":true,"flag":"b","type":"boolean"},"includeApplicants":{"name":"includeApplicants","optional":true,"flag":"a","type":"boolean"},"snapshotDate":{"name":"snapshotDate","optional":true,"flag":"s","type":"Long[Timestamp]"}},
        (data: unknown) => data as ApiTypes.WebGraph,
        2592000,
        'None',
        "WebGraph",
        `Generate a bar char comparing the nation at each city count (tiering) between two coalitions`,
        false
    )
};

export const METRICBYGROUP: CommonEndpoint<ApiTypes.WebGraph, {metrics?: string, nations?: string, groupBy?: string, includeInactives?: string, includeApplicants?: string, total?: string, snapshotDate?: string}, {metrics?: string, nations?: string, groupBy?: string, includeInactives?: string, includeApplicants?: string, total?: string, snapshotDate?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.WebGraph>(
        "metricbygroup",
        "metricByGroup",
        {"metrics":{"name":"metrics","type":"Set\u003cTypedFunction\u003cDBNation,Double\u003e\u003e"},"nations":{"name":"nations","type":"Set\u003cDBNation\u003e"},"groupBy":{"name":"groupBy","optional":true,"type":"TypedFunction\u003cDBNation,Double\u003e","def":"getCities"},"includeInactives":{"name":"includeInactives","optional":true,"flag":"i","type":"boolean"},"includeApplicants":{"name":"includeApplicants","optional":true,"flag":"a","type":"boolean"},"total":{"name":"total","optional":true,"flag":"t","type":"boolean"},"snapshotDate":{"name":"snapshotDate","optional":true,"flag":"s","type":"Long[Timestamp]"}},
        (data: unknown) => data as ApiTypes.WebGraph,
        2592000,
        'None',
        "WebGraph",
        `Graph a set of nation metrics for the specified nations over a period of time based on daily nation and city snapshots`,
        false
    )
};

export const COMPARESTOCKPILEVALUEBYDAY: CommonEndpoint<ApiTypes.WebGraph, {stockpile1?: string, stockpile2?: string, numDays?: string}, {stockpile1?: string, stockpile2?: string, numDays?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.WebGraph>(
        "comparestockpilevaluebyday",
        "compareStockpileValueByDay",
        {"stockpile1":{"name":"stockpile1","type":"Map\u003cResourceType,Double\u003e"},"stockpile2":{"name":"stockpile2","type":"Map\u003cResourceType,Double\u003e"},"numDays":{"name":"numDays","type":"int","min":1.0,"max":3000.0}},
        (data: unknown) => data as ApiTypes.WebGraph,
        2592000,
        'None',
        "WebGraph",
        `Generate a graph comparing market values of two resource amounts by day`,
        false
    )
};

export const METRIC_COMPARE_BY_TURN: CommonEndpoint<ApiTypes.WebGraph, {metric?: string, alliances?: string, start?: string, end?: string}, {metric?: string, alliances?: string, start?: string, end?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.WebGraph>(
        "metric_compare_by_turn",
        "metric_compare_by_turn",
        {"metric":{"name":"metric","type":"AllianceMetric"},"alliances":{"name":"alliances","type":"Set\u003cDBAlliance\u003e"},"start":{"name":"start","desc":"Date to start from","type":"long[Timestamp]"},"end":{"name":"end","optional":true,"type":"Long[Timestamp]"}},
        (data: unknown) => data as ApiTypes.WebGraph,
        2592000,
        'None',
        "WebGraph",
        `Compare the metric over time between multiple alliances`,
        false
    )
};

export const ALLIANCEMETRICAB: CommonEndpoint<ApiTypes.WebGraph, {metric?: string, coalition1?: string, coalition2?: string, start?: string, end?: string}, {metric?: string, coalition1?: string, coalition2?: string, start?: string, end?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.WebGraph>(
        "alliancemetricab",
        "allianceMetricAB",
        {"metric":{"name":"metric","type":"AllianceMetric"},"coalition1":{"name":"coalition1","type":"Set\u003cDBAlliance\u003e"},"coalition2":{"name":"coalition2","type":"Set\u003cDBAlliance\u003e"},"start":{"name":"start","desc":"Date to start from","type":"long[Timestamp]"},"end":{"name":"end","optional":true,"type":"Long[Timestamp]"}},
        (data: unknown) => data as ApiTypes.WebGraph,
        2592000,
        'None',
        "WebGraph",
        `Graph an alliance metric over time for two coalitions`,
        false
    )
};

export const SCORETIERGRAPH: CommonEndpoint<ApiTypes.WebGraph, {coalition1?: string, coalition2?: string, includeInactives?: string, includeApplicants?: string, snapshotDate?: string}, {coalition1?: string, coalition2?: string, includeInactives?: string, includeApplicants?: string, snapshotDate?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.WebGraph>(
        "scoretiergraph",
        "scoreTierGraph",
        {"coalition1":{"name":"coalition1","type":"Set\u003cDBNation\u003e"},"coalition2":{"name":"coalition2","type":"Set\u003cDBNation\u003e"},"includeInactives":{"name":"includeInactives","optional":true,"flag":"i","type":"boolean"},"includeApplicants":{"name":"includeApplicants","optional":true,"flag":"a","type":"boolean"},"snapshotDate":{"name":"snapshotDate","optional":true,"flag":"s","type":"Long[Timestamp]"}},
        (data: unknown) => data as ApiTypes.WebGraph,
        2592000,
        'None',
        "WebGraph",
        `Generate a graph of nation counts by score between two coalitions`,
        false
    )
};

export const RADIATIONBYTURN: CommonEndpoint<ApiTypes.WebGraph, {continents?: string, start?: string, end?: string}, {continents?: string, start?: string, end?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.WebGraph>(
        "radiationbyturn",
        "radiationByTurn",
        {"continents":{"name":"continents","type":"Set\u003cContinent\u003e"},"start":{"name":"start","type":"long[Timestamp]"},"end":{"name":"end","optional":true,"type":"Long[Timestamp]"}},
        (data: unknown) => data as ApiTypes.WebGraph,
        2592000,
        'None',
        "WebGraph",
        `Graph global and per continent radiation by turn over a specified time period`,
        false
    )
};

export const SPYTIERGRAPH: CommonEndpoint<ApiTypes.WebGraph, {coalition1?: string, coalition2?: string, includeInactives?: string, includeApplicants?: string, total?: string, barGraph?: string}, {coalition1?: string, coalition2?: string, includeInactives?: string, includeApplicants?: string, total?: string, barGraph?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.WebGraph>(
        "spytiergraph",
        "spyTierGraph",
        {"coalition1":{"name":"coalition1","type":"Set\u003cDBNation\u003e"},"coalition2":{"name":"coalition2","type":"Set\u003cDBNation\u003e"},"includeInactives":{"name":"includeInactives","optional":true,"flag":"i","type":"boolean"},"includeApplicants":{"name":"includeApplicants","optional":true,"flag":"a","type":"boolean"},"total":{"name":"total","optional":true,"flag":"t","desc":"Graph the total spies instead of average per nation","type":"boolean"},"barGraph":{"name":"barGraph","optional":true,"flag":"b","type":"boolean"}},
        (data: unknown) => data as ApiTypes.WebGraph,
        2592000,
        'None',
        "WebGraph",
        `Generate a graph of spy counts by city count between two coalitions
Nations which are applicants, in vacation mode or inactive (2 days) are excluded`,
        false
    )
};

export const ALLIANCESDATABYDAY: CommonEndpoint<ApiTypes.WebGraph, {metric?: string, start?: string, end?: string, mode?: string, alliances?: string, filter?: string, includeApps?: string}, {metric?: string, start?: string, end?: string, mode?: string, alliances?: string, filter?: string, includeApps?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.WebGraph>(
        "alliancesdatabyday",
        "AlliancesDataByDay",
        {"metric":{"name":"metric","type":"TypedFunction\u003cDBNation,Double\u003e"},"start":{"name":"start","type":"long[Timestamp]"},"end":{"name":"end","type":"long[Timestamp]"},"mode":{"name":"mode","type":"AllianceMetricMode"},"alliances":{"name":"alliances","optional":true,"desc":"The alliances to include. Defaults to top 15","type":"Set\u003cDBAlliance\u003e"},"filter":{"name":"filter","optional":true,"type":"Predicate\u003cDBNation\u003e"},"includeApps":{"name":"includeApps","optional":true,"flag":"a","type":"boolean"}},
        (data: unknown) => data as ApiTypes.WebGraph,
        2592000,
        'None',
        "WebGraph",
        `Get alliance attributes by day
If your metric does not relate to cities, set \`skipCityData\` to true to speed up the process.`,
        false
    )
};

export const WARATTACKSBYDAY: CommonEndpoint<ApiTypes.WebGraph, {nations?: string, cutoff?: string, allowedTypes?: string}, {nations?: string, cutoff?: string, allowedTypes?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.WebGraph>(
        "warattacksbyday",
        "warAttacksByDay",
        {"nations":{"name":"nations","optional":true,"type":"Set\u003cDBNation\u003e"},"cutoff":{"name":"cutoff","optional":true,"desc":"Period of time to graph","type":"Long[Timestamp]"},"allowedTypes":{"name":"allowedTypes","optional":true,"desc":"Restrict to a list of attack types","type":"Set\u003cAttackType\u003e"}},
        (data: unknown) => data as ApiTypes.WebGraph,
        2592000,
        'None',
        "WebGraph",
        `Display a graph of the number of attacks by the specified nations per day over a time period`,
        false
    )
};

export const ALLIANCEMETRICBYTURN: CommonEndpoint<ApiTypes.WebGraph, {metric?: string, coalition?: string, start?: string, end?: string}, {metric?: string, coalition?: string, start?: string, end?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.WebGraph>(
        "alliancemetricbyturn",
        "allianceMetricByTurn",
        {"metric":{"name":"metric","type":"AllianceMetric"},"coalition":{"name":"coalition","type":"Set\u003cDBAlliance\u003e"},"start":{"name":"start","desc":"Date to start from","type":"long[Timestamp]"},"end":{"name":"end","optional":true,"type":"Long[Timestamp]"}},
        (data: unknown) => data as ApiTypes.WebGraph,
        2592000,
        'None',
        "WebGraph",
        `Graph the metric over time for a coalition`,
        false
    )
};

export const WARCOSTSBYDAY: CommonEndpoint<ApiTypes.WebGraph, {coalition1?: string, coalition2?: string, type?: string, time_start?: string, time_end?: string, running_total?: string, allowedWarStatus?: string, allowedWarTypes?: string, allowedAttackTypes?: string, allowedVictoryTypes?: string}, {coalition1?: string, coalition2?: string, type?: string, time_start?: string, time_end?: string, running_total?: string, allowedWarStatus?: string, allowedWarTypes?: string, allowedAttackTypes?: string, allowedVictoryTypes?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.WebGraph>(
        "warcostsbyday",
        "warCostsByDay",
        {"coalition1":{"name":"coalition1","type":"Set\u003cNationOrAlliance\u003e"},"coalition2":{"name":"coalition2","type":"Set\u003cNationOrAlliance\u003e"},"type":{"name":"type","type":"WarCostByDayMode"},"time_start":{"name":"time_start","type":"long[Timestamp]"},"time_end":{"name":"time_end","optional":true,"type":"Long[Timestamp]"},"running_total":{"name":"running_total","optional":true,"flag":"o","type":"boolean"},"allowedWarStatus":{"name":"allowedWarStatus","optional":true,"flag":"s","type":"Set\u003cWarStatus\u003e"},"allowedWarTypes":{"name":"allowedWarTypes","optional":true,"flag":"w","type":"Set\u003cWarType\u003e"},"allowedAttackTypes":{"name":"allowedAttackTypes","optional":true,"flag":"a","type":"Set\u003cAttackType\u003e"},"allowedVictoryTypes":{"name":"allowedVictoryTypes","optional":true,"flag":"v","type":"Set\u003cSuccessType\u003e"}},
        (data: unknown) => data as ApiTypes.WebGraph,
        2592000,
        'None',
        "WebGraph",
        `Get a line graph by day of the war stats between two coalitions`,
        false
    )
};

export const MILITARIZATIONTIME: CommonEndpoint<ApiTypes.WebGraph, {alliance?: string, start_time?: string, end_time?: string}, {alliance?: string, start_time?: string, end_time?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.WebGraph>(
        "militarizationtime",
        "militarizationTime",
        {"alliance":{"name":"alliance","type":"DBAlliance"},"start_time":{"name":"start_time","optional":true,"type":"long[Timestamp]","def":"7d"},"end_time":{"name":"end_time","optional":true,"flag":"e","type":"Long[Timestamp]"}},
        (data: unknown) => data as ApiTypes.WebGraph,
        2592000,
        'None',
        "WebGraph",
        `Graph militarization (soldier, tank, aircraft, ship) over time of an alliance`,
        false
    )
};

export const ORBISSTATBYDAY: CommonEndpoint<ApiTypes.WebGraph, {metrics?: string, start?: string, end?: string}, {metrics?: string, start?: string, end?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.WebGraph>(
        "orbisstatbyday",
        "orbisStatByDay",
        {"metrics":{"name":"metrics","type":"Set\u003cOrbisMetric\u003e"},"start":{"name":"start","optional":true,"type":"Long[Timestamp]"},"end":{"name":"end","optional":true,"type":"Long[Timestamp]"}},
        (data: unknown) => data as ApiTypes.WebGraph,
        2592000,
        'None',
        "WebGraph",
        `Get a game graph by day`,
        false
    )
};

export const NTHBEIGELOOTBYSCORERANGE: CommonEndpoint<ApiTypes.WebGraph, {nations?: string, n?: string, snapshotDate?: string}, {nations?: string, n?: string, snapshotDate?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.WebGraph>(
        "nthbeigelootbyscorerange",
        "NthBeigeLootByScoreRange",
        {"nations":{"name":"nations","optional":true,"type":"Set\u003cDBNation\u003e"},"n":{"name":"n","optional":true,"type":"int","def":"5"},"snapshotDate":{"name":"snapshotDate","optional":true,"type":"Long[Timestamp]"}},
        (data: unknown) => data as ApiTypes.WebGraph,
        2592000,
        'None',
        "WebGraph",
        `Get nth loot beige graph by score range`,
        false
    )
};

export const WARSCOSTRANKINGBYDAY: CommonEndpoint<ApiTypes.WebGraph, {type?: string, mode?: string, time_start?: string, time_end?: string, coalition1?: string, coalition2?: string, coalition3?: string, coalition4?: string, coalition5?: string, coalition6?: string, coalition7?: string, coalition8?: string, coalition9?: string, coalition10?: string, running_total?: string, allowedWarStatus?: string, allowedWarTypes?: string, allowedAttackTypes?: string, allowedVictoryTypes?: string}, {type?: string, mode?: string, time_start?: string, time_end?: string, coalition1?: string, coalition2?: string, coalition3?: string, coalition4?: string, coalition5?: string, coalition6?: string, coalition7?: string, coalition8?: string, coalition9?: string, coalition10?: string, running_total?: string, allowedWarStatus?: string, allowedWarTypes?: string, allowedAttackTypes?: string, allowedVictoryTypes?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.WebGraph>(
        "warscostrankingbyday",
        "warsCostRankingByDay",
        {"type":{"name":"type","type":"WarCostByDayMode"},"mode":{"name":"mode","type":"WarCostMode"},"time_start":{"name":"time_start","type":"long[Timestamp]"},"time_end":{"name":"time_end","optional":true,"type":"Long[Timestamp]"},"coalition1":{"name":"coalition1","optional":true,"flag":"c1","type":"Set\u003cNationOrAlliance\u003e"},"coalition2":{"name":"coalition2","optional":true,"flag":"c2","type":"Set\u003cNationOrAlliance\u003e"},"coalition3":{"name":"coalition3","optional":true,"flag":"c3","type":"Set\u003cNationOrAlliance\u003e"},"coalition4":{"name":"coalition4","optional":true,"flag":"c4","type":"Set\u003cNationOrAlliance\u003e"},"coalition5":{"name":"coalition5","optional":true,"flag":"c5","type":"Set\u003cNationOrAlliance\u003e"},"coalition6":{"name":"coalition6","optional":true,"flag":"c6","type":"Set\u003cNationOrAlliance\u003e"},"coalition7":{"name":"coalition7","optional":true,"flag":"c7","type":"Set\u003cNationOrAlliance\u003e"},"coalition8":{"name":"coalition8","optional":true,"flag":"c8","type":"Set\u003cNationOrAlliance\u003e"},"coalition9":{"name":"coalition9","optional":true,"flag":"c9","type":"Set\u003cNationOrAlliance\u003e"},"coalition10":{"name":"coalition10","optional":true,"flag":"c10","type":"Set\u003cNationOrAlliance\u003e"},"running_total":{"name":"running_total","optional":true,"flag":"o","type":"boolean"},"allowedWarStatus":{"name":"allowedWarStatus","optional":true,"flag":"s","type":"Set\u003cWarStatus\u003e"},"allowedWarTypes":{"name":"allowedWarTypes","optional":true,"flag":"w","type":"Set\u003cWarType\u003e"},"allowedAttackTypes":{"name":"allowedAttackTypes","optional":true,"flag":"a","type":"Set\u003cAttackType\u003e"},"allowedVictoryTypes":{"name":"allowedVictoryTypes","optional":true,"flag":"v","type":"Set\u003cSuccessType\u003e"}},
        (data: unknown) => data as ApiTypes.WebGraph,
        2592000,
        'None',
        "WebGraph",
        `Graph of cost by day of each coalitions wars vs everyone`,
        false
    )
};

export const TRADEPRICEBYDAY: CommonEndpoint<ApiTypes.WebGraph, {resources?: string, numDays?: string}, {resources?: string, numDays?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.WebGraph>(
        "tradepricebyday",
        "tradePriceByDay",
        {"resources":{"name":"resources","type":"Set\u003cResourceType\u003e"},"numDays":{"name":"numDays","type":"int"}},
        (data: unknown) => data as ApiTypes.WebGraph,
        2592000,
        'None',
        "WebGraph",
        `Generate a graph of average buy and sell trade price by day`,
        false
    )
};

export const TRADEMARGINBYDAY: CommonEndpoint<ApiTypes.WebGraph, {resources?: string, start?: string, end?: string, percent?: string}, {resources?: string, start?: string, end?: string, percent?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.WebGraph>(
        "trademarginbyday",
        "tradeMarginByDay",
        {"resources":{"name":"resources","type":"Set\u003cResourceType\u003e"},"start":{"name":"start","type":"long[Timestamp]"},"end":{"name":"end","optional":true,"type":"Long[Timestamp]"},"percent":{"name":"percent","optional":true,"desc":"Use the margin percent instead of absolute difference","type":"boolean","def":"true"}},
        (data: unknown) => data as ApiTypes.WebGraph,
        2592000,
        'None',
        "WebGraph",
        `Generate a graph of average trade buy and sell margin by day`,
        false
    )
};

export const TRADETOTALBYDAY: CommonEndpoint<ApiTypes.WebGraph, {resource?: string, start?: string, end?: string}, {resource?: string, start?: string, end?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.WebGraph>(
        "tradetotalbyday",
        "tradeTotalByDay",
        {"resource":{"name":"resource","type":"ResourceType"},"start":{"name":"start","type":"long[Timestamp]"},"end":{"name":"end","optional":true,"type":"Long[Timestamp]"}},
        (data: unknown) => data as ApiTypes.WebGraph,
        2592000,
        'None',
        "WebGraph",
        `Generate a graph of average trade buy and sell total by day`,
        false
    )
};

export const TRADEVOLUMEBYDAY: CommonEndpoint<ApiTypes.WebGraph, {resource?: string, start?: string, end?: string}, {resource?: string, start?: string, end?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.WebGraph>(
        "tradevolumebyday",
        "tradeVolumeByDay",
        {"resource":{"name":"resource","type":"ResourceType"},"start":{"name":"start","type":"long[Timestamp]"},"end":{"name":"end","optional":true,"type":"Long[Timestamp]"}},
        (data: unknown) => data as ApiTypes.WebGraph,
        2592000,
        'None',
        "WebGraph",
        `Generate a graph of average trade buy and sell volume by day`,
        false
    )
};

export const COMPARETIERDELTAGRAPH: CommonEndpoint<ApiTypes.WebGraph, {coalition1?: string, coalition2?: string, coalition3?: string, coalition4?: string, coalition5?: string, coalition6?: string, coalition7?: string, coalition8?: string, coalition9?: string, coalition10?: string, stat?: string, start?: string, end?: string, mode?: string, bucket_size?: string, include_apps?: string, include_vm?: string, filter?: string}, {coalition1?: string, coalition2?: string, coalition3?: string, coalition4?: string, coalition5?: string, coalition6?: string, coalition7?: string, coalition8?: string, coalition9?: string, coalition10?: string, stat?: string, start?: string, end?: string, mode?: string, bucket_size?: string, include_apps?: string, include_vm?: string, filter?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.WebGraph>(
        "comparetierdeltagraph",
        "compareTierDeltaGraph",
        {"coalition1":{"name":"coalition1","type":"Set\u003cDBNation\u003e"},"coalition2":{"name":"coalition2","optional":true,"type":"Set\u003cDBNation\u003e"},"coalition3":{"name":"coalition3","optional":true,"type":"Set\u003cDBNation\u003e"},"coalition4":{"name":"coalition4","optional":true,"type":"Set\u003cDBNation\u003e"},"coalition5":{"name":"coalition5","optional":true,"type":"Set\u003cDBNation\u003e"},"coalition6":{"name":"coalition6","optional":true,"type":"Set\u003cDBNation\u003e"},"coalition7":{"name":"coalition7","optional":true,"type":"Set\u003cDBNation\u003e"},"coalition8":{"name":"coalition8","optional":true,"type":"Set\u003cDBNation\u003e"},"coalition9":{"name":"coalition9","optional":true,"type":"Set\u003cDBNation\u003e"},"coalition10":{"name":"coalition10","optional":true,"type":"Set\u003cDBNation\u003e"},"stat":{"name":"stat","optional":true,"flag":"s","type":"TypedFunction\u003cDBNation,Double\u003e","def":"getCities"},"start":{"name":"start","optional":true,"flag":"b","type":"Long[Timestamp]","def":"30d"},"end":{"name":"end","optional":true,"flag":"c","type":"Long[Timestamp]","def":"0d"},"mode":{"name":"mode","optional":true,"flag":"m","type":"TierDeltaMode","def":"net"},"bucket_size":{"name":"bucket_size","optional":true,"flag":"k","type":"Integer","def":"1"},"include_apps":{"name":"include_apps","optional":true,"flag":"a","type":"boolean"},"include_vm":{"name":"include_vm","optional":true,"flag":"v","type":"boolean"},"filter":{"name":"filter","optional":true,"flag":"f","type":"Predicate\u003cDBNation\u003e"}},
        (data: unknown) => data as ApiTypes.WebGraph,
        2592000,
        'None',
        "WebGraph",
        `Compare city-tier snapshot deltas (start/end/net/gained/lost) for up to 10 coalitions
Defaults`,
        false
    )
};

export const WARRANKING: CommonEndpoint<ApiTypes.RankingResult, {attackers?: string, defenders?: string, time?: string, onlyOffensives?: string, onlyDefensives?: string, only_rank_attackers?: string, normalizePerMember?: string, ignore2dInactives?: string, rankByNation?: string, warType?: string, statuses?: string}, {attackers?: string, defenders?: string, time?: string, onlyOffensives?: string, onlyDefensives?: string, only_rank_attackers?: string, normalizePerMember?: string, ignore2dInactives?: string, rankByNation?: string, warType?: string, statuses?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.RankingResult>(
        "warranking",
        "warRanking",
        {"attackers":{"name":"attackers","type":"Set\u003cNationOrAlliance\u003e"},"defenders":{"name":"defenders","type":"Set\u003cNationOrAlliance\u003e"},"time":{"name":"time","desc":"Date to start from","type":"long[Timestamp]"},"onlyOffensives":{"name":"onlyOffensives","optional":true,"flag":"o","type":"boolean"},"onlyDefensives":{"name":"onlyDefensives","optional":true,"flag":"d","type":"boolean"},"only_rank_attackers":{"name":"only_rank_attackers","optional":true,"flag":"c","type":"boolean"},"normalizePerMember":{"name":"normalizePerMember","optional":true,"flag":"n","type":"boolean"},"ignore2dInactives":{"name":"ignore2dInactives","optional":true,"flag":"i","type":"boolean"},"rankByNation":{"name":"rankByNation","optional":true,"flag":"a","type":"boolean"},"warType":{"name":"warType","optional":true,"flag":"t","type":"WarType"},"statuses":{"name":"statuses","optional":true,"flag":"s","type":"Set\u003cWarStatus\u003e"}},
        (data: unknown) => data as ApiTypes.RankingResult,
        2592000,
        'None',
        "RankingResult",
        `Rank the number of wars between two coalitions by nation or alliance`,
        false
    )
};

export const WARCOSTRANKING: CommonEndpoint<ApiTypes.RankingResult, {timeStart?: string, timeEnd?: string, coalition1?: string, coalition2?: string, onlyRankCoalition1?: string, type?: string, stat?: string, excludeInfra?: string, excludeConsumption?: string, excludeLoot?: string, excludeBuildings?: string, excludeUnits?: string, groupByAlliance?: string, scalePerWar?: string, scalePerCity?: string, allowedWarTypes?: string, allowedWarStatuses?: string, allowedAttacks?: string, allowed_alliances?: string, onlyOffensiveWars?: string, onlyDefensiveWars?: string, highlight?: string}, {timeStart?: string, timeEnd?: string, coalition1?: string, coalition2?: string, onlyRankCoalition1?: string, type?: string, stat?: string, excludeInfra?: string, excludeConsumption?: string, excludeLoot?: string, excludeBuildings?: string, excludeUnits?: string, groupByAlliance?: string, scalePerWar?: string, scalePerCity?: string, allowedWarTypes?: string, allowedWarStatuses?: string, allowedAttacks?: string, allowed_alliances?: string, onlyOffensiveWars?: string, onlyDefensiveWars?: string, highlight?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.RankingResult>(
        "warcostranking",
        "warCostRanking",
        {"timeStart":{"name":"timeStart","type":"long[Timestamp]"},"timeEnd":{"name":"timeEnd","type":"Long[Timestamp]"},"coalition1":{"name":"coalition1","optional":true,"type":"Set\u003cNationOrAlliance\u003e","def":"*"},"coalition2":{"name":"coalition2","optional":true,"type":"Set\u003cNationOrAlliance\u003e"},"onlyRankCoalition1":{"name":"onlyRankCoalition1","optional":true,"flag":"a","type":"boolean"},"type":{"name":"type","type":"WarCostMode"},"stat":{"name":"stat","type":"WarCostStat"},"excludeInfra":{"name":"excludeInfra","optional":true,"flag":"i","type":"boolean"},"excludeConsumption":{"name":"excludeConsumption","optional":true,"flag":"c","type":"boolean"},"excludeLoot":{"name":"excludeLoot","optional":true,"flag":"l","type":"boolean"},"excludeBuildings":{"name":"excludeBuildings","optional":true,"flag":"b","type":"boolean"},"excludeUnits":{"name":"excludeUnits","optional":true,"flag":"u","type":"boolean"},"groupByAlliance":{"name":"groupByAlliance","optional":true,"flag":"g","type":"boolean"},"scalePerWar":{"name":"scalePerWar","optional":true,"flag":"w","type":"boolean"},"scalePerCity":{"name":"scalePerCity","optional":true,"flag":"p","type":"boolean"},"allowedWarTypes":{"name":"allowedWarTypes","optional":true,"flag":"wartype","type":"Set\u003cWarType\u003e"},"allowedWarStatuses":{"name":"allowedWarStatuses","optional":true,"flag":"status","type":"Set\u003cWarStatus\u003e"},"allowedAttacks":{"name":"allowedAttacks","optional":true,"flag":"attacks","type":"Set\u003cAttackType\u003e"},"allowed_alliances":{"name":"allowed_alliances","optional":true,"flag":"aa","type":"Set\u003cDBAlliance\u003e"},"onlyOffensiveWars":{"name":"onlyOffensiveWars","optional":true,"flag":"off","type":"boolean"},"onlyDefensiveWars":{"name":"onlyDefensiveWars","optional":true,"flag":"def","type":"boolean"},"highlight":{"name":"highlight","optional":true,"flag":"h","type":"Set\u003cDBAlliance\u003e"}},
        (data: unknown) => data as ApiTypes.RankingResult,
        2592000,
        'None',
        "RankingResult",
        `Rank war costs between two parties`,
        false
    )
};

export const WARSTATUSRANKINGBYNATION: CommonEndpoint<ApiTypes.RankingResult, {attackers?: string, defenders?: string, time?: string}, {attackers?: string, defenders?: string, time?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.RankingResult>(
        "warstatusrankingbynation",
        "warStatusRankingByNation",
        {"attackers":{"name":"attackers","type":"Set\u003cDBNation\u003e"},"defenders":{"name":"defenders","type":"Set\u003cDBNation\u003e"},"time":{"name":"time","desc":"Date to start from","type":"long[Timestamp]"}},
        (data: unknown) => data as ApiTypes.RankingResult,
        2592000,
        'None',
        "RankingResult",
        `Generate ranking of war status by Nation`,
        false
    )
};

export const BASEBALLEARNINGSRANKING: CommonEndpoint<ApiTypes.RankingResult, {date?: string, byAlliance?: string}, {date?: string, byAlliance?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.RankingResult>(
        "baseballearningsranking",
        "baseballEarningsRanking",
        {"date":{"name":"date","desc":"Date to start from","type":"long[Timestamp]"},"byAlliance":{"name":"byAlliance","optional":true,"flag":"a","desc":"Group the rankings by alliance instead of nations","type":"boolean"}},
        (data: unknown) => data as ApiTypes.RankingResult,
        2592000,
        'None',
        "RankingResult",
        `Rank nations or alliances by baseball earnings from a specified date`,
        false
    )
};

export const BASEBALLCHALLENGERANKING: CommonEndpoint<ApiTypes.RankingResult, {byAlliance?: string}, {byAlliance?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.RankingResult>(
        "baseballchallengeranking",
        "baseballChallengeRanking",
        {"byAlliance":{"name":"byAlliance","optional":true,"flag":"a","desc":"Group the rankings by alliance instead of nations","type":"boolean"}},
        (data: unknown) => data as ApiTypes.RankingResult,
        2592000,
        'None',
        "RankingResult",
        `Rank nations or alliances by challenge baseball games`,
        false
    )
};

export const BASEBALLCHALLENGEEARNINGSRANKING: CommonEndpoint<ApiTypes.RankingResult, {byAlliance?: string}, {byAlliance?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.RankingResult>(
        "baseballchallengeearningsranking",
        "baseballChallengeEarningsRanking",
        {"byAlliance":{"name":"byAlliance","optional":true,"flag":"a","desc":"Group the rankings by alliance instead of nations","type":"boolean"}},
        (data: unknown) => data as ApiTypes.RankingResult,
        2592000,
        'None',
        "RankingResult",
        `Rank nations or alliances by challenge baseball earnings`,
        false
    )
};

export const INCENTIVERANKING: CommonEndpoint<ApiTypes.RankingResult, {timestamp?: string}, {timestamp?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.RankingResult>(
        "incentiveranking",
        "incentiveRanking",
        {"timestamp":{"name":"timestamp","desc":"Date to start from","type":"long[Timestamp]"}},
        (data: unknown) => data as ApiTypes.RankingResult,
        2592000,
        'None',
        "RankingResult",
        `Rank nations by incentive rewards received`,
        false
    )
};

export const BASEBALLRANKING: CommonEndpoint<ApiTypes.RankingResult, {date?: string, byAlliance?: string}, {date?: string, byAlliance?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.RankingResult>(
        "baseballranking",
        "baseballRanking",
        {"date":{"name":"date","desc":"Date to start from","type":"long[Timestamp]"},"byAlliance":{"name":"byAlliance","optional":true,"flag":"a","desc":"Group the rankings by alliance instead of nations","type":"boolean"}},
        (data: unknown) => data as ApiTypes.RankingResult,
        2592000,
        'None',
        "RankingResult",
        `Rank nations or alliances by baseball games from a specified date`,
        false
    )
};

export const ATTACKTYPERANKING: CommonEndpoint<ApiTypes.RankingResult, {time?: string, type?: string, alliances?: string, only_top_x?: string, percent?: string, only_off_wars?: string, only_def_wars?: string}, {time?: string, type?: string, alliances?: string, only_top_x?: string, percent?: string, only_off_wars?: string, only_def_wars?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.RankingResult>(
        "attacktyperanking",
        "attackTypeRanking",
        {"time":{"name":"time","type":"long[Timestamp]"},"type":{"name":"type","type":"AttackType"},"alliances":{"name":"alliances","type":"Set\u003cDBAlliance\u003e"},"only_top_x":{"name":"only_top_x","optional":true,"flag":"x","type":"Integer","min":1.0,"max":9999.0},"percent":{"name":"percent","optional":true,"flag":"p","type":"boolean"},"only_off_wars":{"name":"only_off_wars","optional":true,"flag":"o","type":"boolean"},"only_def_wars":{"name":"only_def_wars","optional":true,"flag":"d","type":"boolean"}},
        (data: unknown) => data as ApiTypes.RankingResult,
        2592000,
        'None',
        "RankingResult",
        `Rank the alliances by the % (or total) attacks by type.`,
        false
    )
};

export const ALLIANCEATTRIBUTERANKING: CommonEndpoint<ApiTypes.RankingResult, {attribute?: string, alliances?: string, reverseOrder?: string, highlight?: string}, {attribute?: string, alliances?: string, reverseOrder?: string, highlight?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.RankingResult>(
        "allianceattributeranking",
        "allianceAttributeRanking",
        {"attribute":{"name":"attribute","type":"TypedFunction\u003cDBAlliance,Double\u003e"},"alliances":{"name":"alliances","optional":true,"type":"Set\u003cDBAlliance\u003e"},"reverseOrder":{"name":"reverseOrder","optional":true,"flag":"r","type":"boolean"},"highlight":{"name":"highlight","optional":true,"flag":"h","type":"Set\u003cDBAlliance\u003e"}},
        (data: unknown) => data as ApiTypes.RankingResult,
        2592000,
        'None',
        "RankingResult",
        `Rank alliances by an alliance attribute`,
        false
    )
};

export const ALLIANCELOOTRANKING: CommonEndpoint<ApiTypes.RankingResult, {time?: string, showTotal?: string, minScore?: string, maxScore?: string, highlight?: string}, {time?: string, showTotal?: string, minScore?: string, maxScore?: string, highlight?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.RankingResult>(
        "alliancelootranking",
        "allianceLootRanking",
        {"time":{"name":"time","type":"long[Timestamp]"},"showTotal":{"name":"showTotal","optional":true,"flag":"t","desc":"Display the estimated bank size instead of per score","type":"boolean"},"minScore":{"name":"minScore","optional":true,"flag":"min","desc":"Ignore alliances without nations above a certain score","type":"Double"},"maxScore":{"name":"maxScore","optional":true,"flag":"max","desc":"Ignore alliances without nations below a certain score","type":"Double"},"highlight":{"name":"highlight","optional":true,"flag":"h","type":"Set\u003cDBAlliance\u003e"}},
        (data: unknown) => data as ApiTypes.RankingResult,
        2592000,
        'None',
        "RankingResult",
        `Get the largest alliance bank loot per score`,
        false
    )
};

export const NATIONATTRIBUTERANKING: CommonEndpoint<ApiTypes.RankingResult, {nations?: string, attribute?: string, groupByAlliance?: string, reverseOrder?: string, snapshotDate?: string, total?: string, title?: string}, {nations?: string, attribute?: string, groupByAlliance?: string, reverseOrder?: string, snapshotDate?: string, total?: string, title?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.RankingResult>(
        "nationattributeranking",
        "nationAttributeRanking",
        {"nations":{"name":"nations","type":"Set\u003cDBNation\u003e"},"attribute":{"name":"attribute","type":"TypedFunction\u003cDBNation,Double\u003e"},"groupByAlliance":{"name":"groupByAlliance","optional":true,"flag":"a","type":"boolean"},"reverseOrder":{"name":"reverseOrder","optional":true,"flag":"r","type":"boolean"},"snapshotDate":{"name":"snapshotDate","optional":true,"flag":"s","type":"Long[Timestamp]"},"total":{"name":"total","optional":true,"flag":"t","desc":"Total value instead of average per nation","type":"boolean"},"title":{"name":"title","optional":true,"flag":"n","type":"String"}},
        (data: unknown) => data as ApiTypes.RankingResult,
        2592000,
        'None',
        "RankingResult",
        `Rank nations by an attribute`,
        false
    )
};

export const ALLIANCEMETRICRANKING: CommonEndpoint<ApiTypes.RankingResult, {metric?: string, alliances?: string, reverseOrder?: string, highlight?: string}, {metric?: string, alliances?: string, reverseOrder?: string, highlight?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.RankingResult>(
        "alliancemetricranking",
        "allianceMetricRanking",
        {"metric":{"name":"metric","type":"AllianceMetric"},"alliances":{"name":"alliances","optional":true,"type":"Set\u003cDBAlliance\u003e"},"reverseOrder":{"name":"reverseOrder","optional":true,"flag":"r","type":"boolean"},"highlight":{"name":"highlight","optional":true,"flag":"h","type":"Set\u003cDBAlliance\u003e"}},
        (data: unknown) => data as ApiTypes.RankingResult,
        2592000,
        'None',
        "RankingResult",
        `Rank alliances by a metric`,
        false
    )
};

export const ALLIANCEMETRICDELTARANKING: CommonEndpoint<ApiTypes.RankingResult, {alliances?: string, metric?: string, timeStart?: string, timeEnd?: string, reverseOrder?: string, highlight?: string}, {alliances?: string, metric?: string, timeStart?: string, timeEnd?: string, reverseOrder?: string, highlight?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.RankingResult>(
        "alliancemetricdeltaranking",
        "allianceMetricDeltaRanking",
        {"alliances":{"name":"alliances","type":"Set\u003cDBAlliance\u003e"},"metric":{"name":"metric","type":"AllianceMetric"},"timeStart":{"name":"timeStart","type":"long[Timestamp]"},"timeEnd":{"name":"timeEnd","type":"long[Timestamp]"},"reverseOrder":{"name":"reverseOrder","optional":true,"flag":"r","type":"boolean"},"highlight":{"name":"highlight","optional":true,"flag":"h","type":"Set\u003cDBAlliance\u003e"}},
        (data: unknown) => data as ApiTypes.RankingResult,
        2592000,
        'None',
        "RankingResult",
        `Rank alliances by a metric over a specified time period`,
        false
    )
};

export const FINDOFFSHORERANKING: CommonEndpoint<ApiTypes.RankingResult, {alliance?: string, cutoffMs?: string, transfer_count?: string}, {alliance?: string, cutoffMs?: string, transfer_count?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.RankingResult>(
        "findoffshoreranking",
        "findOffshoreRanking",
        {"alliance":{"name":"alliance","type":"DBAlliance"},"cutoffMs":{"name":"cutoffMs","optional":true,"type":"Long[Timestamp]"},"transfer_count":{"name":"transfer_count","optional":true,"flag":"c","desc":"Display the transfer count instead of value","type":"boolean"}},
        (data: unknown) => data as ApiTypes.RankingResult,
        2592000,
        'None',
        "RankingResult",
        `Find potential offshores used by an alliance`,
        false
    )
};

export const PROLIFICOFFSHORESRANKING: CommonEndpoint<ApiTypes.RankingResult, {days?: string}, {days?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.RankingResult>(
        "prolificoffshoresranking",
        "prolificOffshoresRanking",
        {"days":{"name":"days","type":"int","min":1.0,"max":365.0}},
        (data: unknown) => data as ApiTypes.RankingResult,
        2592000,
        'None',
        "RankingResult",
        `List potential offshore alliances by the value of their bank transfers to nations over a period of time`,
        false
    )
};

export const WARSTATUSRANKINGBYALLIANCE: CommonEndpoint<ApiTypes.RankingResult, {attackers?: string, defenders?: string, time?: string}, {attackers?: string, defenders?: string, time?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.RankingResult>(
        "warstatusrankingbyalliance",
        "warStatusRankingByAlliance",
        {"attackers":{"name":"attackers","type":"Set\u003cDBNation\u003e"},"defenders":{"name":"defenders","type":"Set\u003cDBNation\u003e"},"time":{"name":"time","desc":"Date to start from","type":"long[Timestamp]"}},
        (data: unknown) => data as ApiTypes.RankingResult,
        2592000,
        'None',
        "RankingResult",
        `Generate ranking of war status by Alliance`,
        false
    )
};

export const FINDTRADERRANKING: CommonEndpoint<ApiTypes.RankingResult, {type?: string, cutoff?: string, buyOrSell?: string, groupByAlliance?: string, includeMoneyTrades?: string, show_absolute?: string, nations?: string}, {type?: string, cutoff?: string, buyOrSell?: string, groupByAlliance?: string, includeMoneyTrades?: string, show_absolute?: string, nations?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.RankingResult>(
        "findtraderranking",
        "findTraderRanking",
        {"type":{"name":"type","type":"ResourceType"},"cutoff":{"name":"cutoff","desc":"Date to start from","type":"long[Timestamp]"},"buyOrSell":{"name":"buyOrSell","type":"String","choices":["SOLD","BOUGHT"]},"groupByAlliance":{"name":"groupByAlliance","optional":true,"flag":"a","desc":"Group rankings by each nation\u0027s current alliance","type":"boolean"},"includeMoneyTrades":{"name":"includeMoneyTrades","optional":true,"flag":"p","desc":"Include trades done outside of standard market prices","type":"boolean"},"show_absolute":{"name":"show_absolute","optional":true,"flag":"s","type":"boolean"},"nations":{"name":"nations","optional":true,"flag":"n","type":"Set\u003cDBNation\u003e"}},
        (data: unknown) => data as ApiTypes.RankingResult,
        2592000,
        'None',
        "RankingResult",
        `List nations or alliances who have bought and sold the most of a resource over a period`,
        false
    )
};

export const TRADEPROFITRANKING: CommonEndpoint<ApiTypes.RankingResult, {nations?: string, time?: string, groupByAlliance?: string}, {nations?: string, time?: string, groupByAlliance?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.RankingResult>(
        "tradeprofitranking",
        "tradeProfitRanking",
        {"nations":{"name":"nations","type":"Set\u003cDBNation\u003e"},"time":{"name":"time","desc":"Date to start from","type":"long[Timestamp]"},"groupByAlliance":{"name":"groupByAlliance","optional":true,"flag":"a","desc":"Group by alliance instead of nation","type":"boolean"}},
        (data: unknown) => data as ApiTypes.RankingResult,
        2592000,
        'None',
        "RankingResult",
        `View an accumulation of all the net trades a nation made, grouped by nation or alliance`,
        false
    )
};

export const PRODUCERRANKING: CommonEndpoint<ApiTypes.RankingResult, {resources?: string, nationList?: string, ignoreMilitaryUpkeep?: string, ignoreTradeBonus?: string, ignoreNationBonus?: string, includeNegative?: string, includeInactive?: string, listByNation?: string, listAverage?: string, snapshotDate?: string, highlight?: string}, {resources?: string, nationList?: string, ignoreMilitaryUpkeep?: string, ignoreTradeBonus?: string, ignoreNationBonus?: string, includeNegative?: string, includeInactive?: string, listByNation?: string, listAverage?: string, snapshotDate?: string, highlight?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.RankingResult>(
        "producerranking",
        "producerRanking",
        {"resources":{"name":"resources","desc":"The resources to rank production of","type":"Set\u003cResourceType\u003e"},"nationList":{"name":"nationList","optional":true,"desc":"Nations to include in the ranking","type":"Set\u003cDBNation\u003e"},"ignoreMilitaryUpkeep":{"name":"ignoreMilitaryUpkeep","optional":true,"flag":"m","desc":"Exclude military unit upkeep","type":"boolean"},"ignoreTradeBonus":{"name":"ignoreTradeBonus","optional":true,"flag":"t","desc":"Exclude color trade bloc bonus","type":"boolean"},"ignoreNationBonus":{"name":"ignoreNationBonus","optional":true,"flag":"b","desc":"Exclude the new nation bonus","type":"boolean"},"includeNegative":{"name":"includeNegative","optional":true,"flag":"n","desc":"Include negative resource revenue","type":"boolean"},"includeInactive":{"name":"includeInactive","optional":true,"flag":"i","desc":"Include inactive nations (2 days)","type":"boolean"},"listByNation":{"name":"listByNation","optional":true,"flag":"a","desc":"Rank by nation instead of alliances","type":"boolean"},"listAverage":{"name":"listAverage","optional":true,"flag":"s","desc":"Rank by average per nation instead of total","type":"boolean"},"snapshotDate":{"name":"snapshotDate","optional":true,"flag":"d","desc":"The date to use for the snapshot","type":"Long[Timestamp]"},"highlight":{"name":"highlight","optional":true,"flag":"h","desc":"Highlight specific entries in the result","type":"Set\u003cNationOrAlliance\u003e"}},
        (data: unknown) => data as ApiTypes.RankingResult,
        2592000,
        'None',
        "RankingResult",
        `Get a ranking of alliances or nations by their net resource production`,
        false
    )
};

export const RECRUITMENTRANKING: CommonEndpoint<ApiTypes.RankingResult, {cutoff?: string, topX?: string}, {cutoff?: string, topX?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.RankingResult>(
        "recruitmentranking",
        "recruitmentRanking",
        {"cutoff":{"name":"cutoff","desc":"Date to start from","type":"long[Timestamp]"},"topX":{"name":"topX","optional":true,"desc":"Top X alliances to show in the ranking","type":"int","def":"80","min":1.0,"max":150.0}},
        (data: unknown) => data as ApiTypes.RankingResult,
        2592000,
        'None',
        "RankingResult",
        `Rank alliances by their new members over a timeframe`,
        false
    )
};

export const TAX_EXPENSE_BY_TIME: CommonEndpoint<ApiTypes.TaxExpenseTime, {datasetId?: string, start?: string, end?: string, nationFilter?: string, dontRequireGrant?: string, dontRequireTagged?: string, dontRequireExpiry?: string, includeDeposits?: string}, {datasetId?: string, start?: string, end?: string, nationFilter?: string, dontRequireGrant?: string, dontRequireTagged?: string, dontRequireExpiry?: string, includeDeposits?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.TaxExpenseTime>(
        "tax_expense_by_time",
        "tax_expense_by_time",
        {"datasetId":{"name":"datasetId","optional":true,"type":"Integer"},"start":{"name":"start","optional":true,"type":"Long[Timestamp]"},"end":{"name":"end","optional":true,"type":"Long[Timestamp]"},"nationFilter":{"name":"nationFilter","optional":true,"type":"Set\u003cDBNation\u003e"},"dontRequireGrant":{"name":"dontRequireGrant","optional":true,"flag":"g","type":"boolean"},"dontRequireTagged":{"name":"dontRequireTagged","optional":true,"flag":"t","type":"boolean"},"dontRequireExpiry":{"name":"dontRequireExpiry","optional":true,"flag":"e","type":"boolean"},"includeDeposits":{"name":"includeDeposits","optional":true,"flag":"d","type":"boolean"}},
        (data: unknown) => data as ApiTypes.TaxExpenseTime,
        2592000,
        'None',
        "TaxExpenseTime",
        `Show running tax expenses by turn by bracket`,
        false
    )
};

export const TAX_EXPENSE_BRACKET_ROWS: CommonEndpoint<ApiTypes.TaxExpenseBracketRows, {datasetId?: string, taxId?: string}, {datasetId?: string, taxId?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.TaxExpenseBracketRows>(
        "tax_expense_bracket_rows",
        "tax_expense_bracket_rows",
        {"datasetId":{"name":"datasetId","type":"int"},"taxId":{"name":"taxId","type":"int"}},
        (data: unknown) => data as ApiTypes.TaxExpenseBracketRows,
        2592000,
        'None',
        "TaxExpenseBracketRows",
        `Get dedicated bracket rows for a cached tax expense section`,
        false
    )
};

export const TAX_EXPENSE: CommonEndpoint<ApiTypes.TaxExpenses, {start?: string, end?: string, nationList?: string, dontRequireGrant?: string, dontRequireTagged?: string, dontRequireExpiry?: string, includeDeposits?: string}, {start?: string, end?: string, nationList?: string, dontRequireGrant?: string, dontRequireTagged?: string, dontRequireExpiry?: string, includeDeposits?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.TaxExpenses>(
        "tax_expense",
        "tax_expense",
        {"start":{"name":"start","type":"long[Timestamp]"},"end":{"name":"end","optional":true,"type":"Long[Timestamp]"},"nationList":{"name":"nationList","optional":true,"flag":"n","type":"Set\u003cDBNation\u003e"},"dontRequireGrant":{"name":"dontRequireGrant","optional":true,"flag":"g","type":"boolean"},"dontRequireTagged":{"name":"dontRequireTagged","optional":true,"flag":"t","type":"boolean"},"dontRequireExpiry":{"name":"dontRequireExpiry","optional":true,"flag":"e","type":"boolean"},"includeDeposits":{"name":"includeDeposits","optional":true,"flag":"d","type":"boolean"}},
        (data: unknown) => data as ApiTypes.TaxExpenses,
        2592000,
        'None',
        "TaxExpenses",
        `Show cumulative tax expenses over a period by nation/bracket`,
        false
    )
};

export const TAX_EXPENSE_NATION: CommonEndpoint<ApiTypes.TaxExpenseNation, {datasetId?: string, taxId?: string, nation?: string}, {datasetId?: string, taxId?: string, nation?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.TaxExpenseNation>(
        "tax_expense_nation",
        "tax_expense_nation",
        {"datasetId":{"name":"datasetId","type":"int"},"taxId":{"name":"taxId","type":"int"},"nation":{"name":"nation","type":"int"}},
        (data: unknown) => data as ApiTypes.TaxExpenseNation,
        2592000,
        'None',
        "TaxExpenseNation",
        `Get merged detail and transaction data for a cached tax expense nation`,
        false
    )
};

export const TAX_EXPENSE_BY_TIME_BRACKET: CommonEndpoint<ApiTypes.TaxExpenseTimeBracket, {datasetId?: string, taxId?: string}, {datasetId?: string, taxId?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.TaxExpenseTimeBracket>(
        "tax_expense_by_time_bracket",
        "tax_expense_by_time_bracket",
        {"datasetId":{"name":"datasetId","type":"int"},"taxId":{"name":"taxId","type":"int"}},
        (data: unknown) => data as ApiTypes.TaxExpenseTimeBracket,
        2592000,
        'None',
        "TaxExpenseTimeBracket",
        `Get a cached by-time chart series for a single tax expense bracket`,
        false
    )
};

export const TAX_EXPENSE_BY_TIME_RESOURCES: CommonEndpoint<ApiTypes.TaxExpenseTimeResources, {datasetId?: string}, {datasetId?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.TaxExpenseTimeResources>(
        "tax_expense_by_time_resources",
        "tax_expense_by_time_resources",
        {"datasetId":{"name":"datasetId","type":"int"}},
        (data: unknown) => data as ApiTypes.TaxExpenseTimeResources,
        2592000,
        'None',
        "TaxExpenseTimeResources",
        `Get total tax expense resource series for a cached by-time dataset`,
        false
    )
};

export const LIST_COALITIONS: CommonEndpoint<ApiTypes.WebCoalitions, {filter?: string, ignoreDeleted?: string}, {filter?: string, ignoreDeleted?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.WebCoalitions>(
        "list_coalitions",
        "list_coalitions",
        {"filter":{"name":"filter","optional":true,"type":"String"},"ignoreDeleted":{"name":"ignoreDeleted","optional":true,"flag":"d","type":"boolean"}},
        (data: unknown) => data as ApiTypes.WebCoalitions,
        2592000,
        'None',
        "WebCoalitions",
        `List the bot coalitions`,
        false
    )
};

export const LIST_ROLE_ALIASES: CommonEndpoint<ApiTypes.WebRoleAliases, {roles_filter?: string}, {roles_filter?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.WebRoleAliases>(
        "list_role_aliases",
        "list_role_aliases",
        {"roles_filter":{"name":"roles_filter","optional":true,"type":"Set\u003cRoles\u003e"}},
        (data: unknown) => data as ApiTypes.WebRoleAliases,
        2592000,
        'None',
        "WebRoleAliases",
        `List the bot role aliases`,
        false
    )
};

export const ADD_ALLIANCE_ROLE: CommonEndpoint<ApiTypes.WebAllianceAutoRole, {alliance?: string}, {alliance?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.WebAllianceAutoRole>(
        "add_alliance_role",
        "add_alliance_role",
        {"alliance":{"name":"alliance","type":"DBAlliance"}},
        (data: unknown) => data as ApiTypes.WebAllianceAutoRole,
        2592000,
        'None',
        "WebAllianceAutoRole",
        `Create or return the alliance autorole role`,
        true
    )
};

export const ADD_CITY_ROLE: CommonEndpoint<ApiTypes.WebCityAutoRole, {range?: string}, {range?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.WebCityAutoRole>(
        "add_city_role",
        "add_city_role",
        {"range":{"name":"range","type":"CityRanges"}},
        (data: unknown) => data as ApiTypes.WebCityAutoRole,
        2592000,
        'None',
        "WebCityAutoRole",
        `Create or return the city autorole role`,
        true
    )
};

export const REMOVE_CITY_ROLE: CommonEndpoint<ApiTypes.WebCityAutoRole, {range?: string}, {range?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.WebCityAutoRole>(
        "remove_city_role",
        "remove_city_role",
        {"range":{"name":"range","type":"CityRanges"}},
        (data: unknown) => data as ApiTypes.WebCityAutoRole,
        2592000,
        'None',
        "WebCityAutoRole",
        `Delete the city autorole role`,
        true
    )
};

export const ADD_TAX_ROLE: CommonEndpoint<ApiTypes.WebTaxAutoRole, {rate?: string}, {rate?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.WebTaxAutoRole>(
        "add_tax_role",
        "add_tax_role",
        {"rate":{"name":"rate","type":"TaxRate"}},
        (data: unknown) => data as ApiTypes.WebTaxAutoRole,
        2592000,
        'None',
        "WebTaxAutoRole",
        `Create or return the tax autorole role`,
        true
    )
};

export const REMOVE_TAX_ROLE: CommonEndpoint<ApiTypes.WebTaxAutoRole, {rate?: string}, {rate?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.WebTaxAutoRole>(
        "remove_tax_role",
        "remove_tax_role",
        {"rate":{"name":"rate","type":"TaxRate"}},
        (data: unknown) => data as ApiTypes.WebTaxAutoRole,
        2592000,
        'None',
        "WebTaxAutoRole",
        `Delete the tax autorole role`,
        true
    )
};

export const LIST_AUTOROLE_ROLES: CommonEndpoint<ApiTypes.WebAutoRoleRoles, Record<string, never>, Record<string, never>> = {
    endpoint: new ApiEndpoint<ApiTypes.WebAutoRoleRoles>(
        "list_autorole_roles",
        "list_autorole_roles",
        {},
        (data: unknown) => data as ApiTypes.WebAutoRoleRoles,
        2592000,
        'None',
        "WebAutoRoleRoles",
        `List autorole-managed alliance, city, and tax roles`,
        false
    )
};

export const REMOVE_ALLIANCE_ROLE: CommonEndpoint<ApiTypes.WebAllianceAutoRole, {alliance?: string}, {alliance?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.WebAllianceAutoRole>(
        "remove_alliance_role",
        "remove_alliance_role",
        {"alliance":{"name":"alliance","type":"DBAlliance"}},
        (data: unknown) => data as ApiTypes.WebAllianceAutoRole,
        2592000,
        'None',
        "WebAllianceAutoRole",
        `Delete the alliance autorole role`,
        true
    )
};

export const MULTI_V2: CommonEndpoint<ApiTypes.AdvMultiReport, {nation?: string, forceUpdate?: string}, {nation?: string, forceUpdate?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.AdvMultiReport>(
        "multi_v2",
        "multi_v2",
        {"nation":{"name":"nation","type":"DBNation"},"forceUpdate":{"name":"forceUpdate","optional":true,"type":"Boolean"}},
        (data: unknown) => data as ApiTypes.AdvMultiReport,
        2592000,
        'None',
        "AdvMultiReport",
        `Generate advanced multi report using snapshot data and UID map`,
        false
    )
};

export const MULTI_BUSTER: CommonEndpoint<ApiTypes.MultiResult, {nation?: string, forceUpdate?: string}, {nation?: string, forceUpdate?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.MultiResult>(
        "multi_buster",
        "multi_buster",
        {"nation":{"name":"nation","type":"DBNation"},"forceUpdate":{"name":"forceUpdate","optional":true,"type":"Boolean"}},
        (data: unknown) => data as ApiTypes.MultiResult,
        2592000,
        'None',
        "MultiResult",
        `Get multi-buster data for a nation, updating if outdated`,
        false
    )
};

export const CURRENT_TREATIES: CommonEndpoint<ApiTypes.WebCurrentTreaties, Record<string, never>, Record<string, never>> = {
    endpoint: new ApiEndpoint<ApiTypes.WebCurrentTreaties>(
        "current_treaties",
        "current_treaties",
        {},
        (data: unknown) => data as ApiTypes.WebCurrentTreaties,
        2592000,
        'None',
        "WebCurrentTreaties",
        `Get all current active treaties`,
        false
    )
};

export const TREATY_CHANGES: CommonEndpoint<ApiTypes.WebTreatyChanges, {start?: string}, {start?: string}> = {
    endpoint: new ApiEndpoint<ApiTypes.WebTreatyChanges>(
        "treaty_changes",
        "treaty_changes",
        {"start":{"name":"start","type":"long[Timestamp]"}},
        (data: unknown) => data as ApiTypes.WebTreatyChanges,
        2592000,
        'None',
        "WebTreatyChanges",
        `Get treaty changes (signed, extended, cancelled, expired) since a given timestamp`,
        false
    )
};

export const ENDPOINTS = [ADD_ALLIANCE_ROLE, ADD_CITY_ROLE, ADD_TAX_ROLE, ALLIANCEATTRIBUTERANKING, ALLIANCELOOTRANKING, ALLIANCEMETRICAB, ALLIANCEMETRICBYTURN, ALLIANCEMETRICDELTARANKING, ALLIANCEMETRICRANKING, ALLIANCESDATABYDAY, ALLIANCESTATS, ANNOUNCEMENTS, ANNOUNCEMENT_TITLES, ATTACKTYPERANKING, AUTOROLE, AUTOROLEALL, BALANCE, BANK_ACCESS, BASEBALLCHALLENGEEARNINGSRANKING, BASEBALLCHALLENGERANKING, BASEBALLEARNINGSRANKING, BASEBALLRANKING, BLITZPLAN, BOUNTY, CITYTIERGRAPH, COMMAND, COMPARESTATS, COMPARESTOCKPILEVALUEBYDAY, COMPARETIERDELTAGRAPH, COMPARETIERSTATS, CONFLICTALLIANCES, CONFLICTPOSTS, CURRENT_TREATIES, DAMAGE, DETECTCONFLICTSTART, FINDOFFSHORERANKING, FINDTRADERRANKING, GLOBALSTATS, GLOBALTIERSTATS, INCENTIVERANKING, INPUT_OPTIONS, INTEL, LIST_AUTOROLE_ROLES, LIST_COALITIONS, LIST_ROLE_ALIASES, LOCUTUS_TASK, LOCUTUS_TASKS, LOGIN_MAIL, LOGOUT, MARK_ALL_READ, METRICBYGROUP, METRIC_COMPARE_BY_TURN, MILITARIZATIONTIME, MULTI_BUSTER, MULTI_V2, MY_AUDITS, MY_WARS, NATIONATTRIBUTERANKING, NTHBEIGELOOTBYSCORERANGE, ORBISSTATBYDAY, PERMISSION, PRODUCERRANKING, PROLIFICOFFSHORESRANKING, QUERY, RADIATIONBYTURN, RAID, READ_ANNOUNCEMENT, RECORDS, RECRUITMENTRANKING, REGISTER, REMOVEVIRTUALCONFLICT, REMOVE_ALLIANCE_ROLE, REMOVE_CITY_ROLE, REMOVE_TAX_ROLE, SCORETIERGRAPH, SESSION, SETTINGS_VALIDATION_CHEAPNESS, SETTINGS_VALIDATION_ERRORS, SET_GUILD, SET_OAUTH_CODE, SET_TOKEN, SIMADHOC, SIMBLITZ, SIMSCHEDULE, SPYOPS, SPYTIERGRAPH, STRENGTHTIERGRAPH, TABLE, TAX_EXPENSE, TAX_EXPENSE_BRACKET_ROWS, TAX_EXPENSE_BY_TIME, TAX_EXPENSE_BY_TIME_BRACKET, TAX_EXPENSE_BY_TIME_RESOURCES, TAX_EXPENSE_NATION, TRADEMARGINBYDAY, TRADEPRICEBYDAY, TRADEPRICEBYDAYJSON, TRADEPROFITRANKING, TRADETOTALBYDAY, TRADEVOLUMEBYDAY, TREASURE, TREATY_CHANGES, UNPROTECTED, UNREAD_ANNOUNCEMENT, UNREAD_COUNT, UNREGISTER, UNSET_GUILD, VIEW_ANNOUNCEMENT, VIRTUALCONFLICTINFO, VIRTUALCONFLICTS, WAR, WARATTACKSBYDAY, WARCOSTRANKING, WARCOSTSBYDAY, WARRANKING, WARSBETWEEN, WARSCOSTRANKINGBYDAY, WARSINVOLVING, WARSTATUSRANKINGBYALLIANCE, WARSTATUSRANKINGBYNATION, WITHDRAW];
