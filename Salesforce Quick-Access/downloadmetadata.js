let editor;
let baseUrl;
let records;
let recordID;
let sessionId;
let doc_title;
let recordsChunk;
let metadataName;
let metadataTypeFolderExtentionMap = new Map([
  ['Flow', { folder: 'flows', extension: 'flow' }],
  ['ApexClass', { folder: 'classes', extension: 'cls' }],
  ['FlexiPage', { folder: 'flexipages', extension: 'flexipage' }],
  ['ApexPage', { folder: 'pages', extension: 'page' }],
  ['ApexTrigger', { folder: 'triggers', extension: 'trigger' }],
  ['Layout', { folder: 'layouts', extension: 'layout' }],
  ['Profile', { folder: 'profiles', extension: 'profile' }],
  ['ApexComponent', { folder: 'components', extension: 'component' }],
  ['PermissionSet', { folder: 'permissionsets', extension: 'permissionset' }],
  ['PermissionSetGroup', { folder: 'permissionsetgroups', extension: 'permissionsetgroup' }],
  ['OmniDataTransform', { folder: 'omniDataTransforms', extension: 'rpt' }],
  ['OmniScript', { folder: 'omniScripts', extension: 'os' }],
  ['OmniUiCard', { folder: 'omniUiCard', extension: 'ouc' }],
  ['OmniIntegrationProcedure', { folder: 'omniIntegrationProcedures', extension: 'oip' }],
  ['Queue', { folder: 'queues', extension: 'queue' }]
]);
$(document).ready(function () {
    let url = new URL(window.location.href);
    //console.log('$url: ', url);
    baseUrl = url.searchParams.get('baseUrl');
    //console.log('$baseUrl: ', baseUrl);
    setSessionText();
    sessionId = url.searchParams.get('sessionId');
    //console.log('$sessionId: ', sessionId);
    recordID = url.searchParams.get('recordID');
    //console.log('$recordID: ', recordID);
    generateMatadataTypes();
    // temp();
    // fetchMetadatRecords();
});

function temp(){
    const content = `public class ContactController {
	
    public ContactController(){
        Contact con = new Contact();
        con.LastName = 'Last';
        //con.Area__c = '';
    }
}`
    $('.download-div-container').addClass('hide');
    $('.small_popup_4').removeClass('hide');
    $('.container').addClass('blur');
    $('.small_popup_4_box_heading_div').text(`ContactController.cls`);

    editor = ace.edit(document.querySelector("#editor"));
    editor.setOptions({
        mode: "ace/mode/apex"
    });
    editor.getSession().setValue(content);
}

let metadataTypes = ['AccessControlPolicy', 'AccountForecastSettings', 'AccountingFieldMapping', 'AccountingModelConfig', 'AccountingSettings', 'AccountInsightsSettings', 'AccountIntelligenceSettings', 'AccountPlanObjMeasCalcDef', 'AccountPlanSettings', 'AccountRelationshipShareRule', 'AccountSettings', 'AcctMgrTargetSettings', 'ActionableEventOrchDef', 'ActionableEventTypeDef', 'ActionableListDefinition', 'ActionLauncherItemDef', 'ActionLinkGroupTemplate', 'ActionPlanTemplate', 'ActionsSettings', 'ActivationPlatform', 'ActivitiesSettings', 'ActnblListKeyPrfmIndDef', 'AddressSettings', 'AdvAccountForecastSet', 'AdvAcctForecastDimSource', 'AdvAcctForecastPeriodGroup', 'AffinityScoreDefinition', 'AgentforceForDevelopersSettings', 'AgentPlatformSettings', 'Ai4mSettings', 'AIApplication', 'AIApplicationConfig', 'AIAssistantTemplate', 'AIConvSummarizationConfig', 'AiEvaluationDefinition', 'AILiveMetricDefinition', 'AiPlannerVoiceDef', 'AiPluginUtteranceDef', 'AIReplyRecommendationsSettings', 'AIScoringModelDefinition', 'AIScoringModelDefVersion', 'AIUsecaseDefinition', 'AnalysisConfiguration', 'AnalyticsDashboard', 'AnalyticsDataServicesSettings', 'AnalyticSnapshot', 'AnalyticsSettings', 'AnalyticsVisualization', 'AnalyticsWorkspace', 'AnimationRule', 'ApexClass', 'ApexComponent', 'ApexEmailNotifications', 'ApexPage', 'ApexSettings', 'ApexTestSuite', 'ApexTrigger', 'AppAnalyticsSettings', 'AppExperienceSettings', 'AppExplorationDataConsent', 'AppFrameworkTemplateBundle', 'AppleDomainVerification', 'ApplicationRecordTypeConfig', 'ApplicationSubtypeDefinition', 'AppMenu', 'AppointmentAssignmentPolicy', 'AppointmentSchedulingPolicy', 'ApprovalProcess', 'ArchiveSettings', 'AssessmentConfiguration', 'AssessmentQuestion', 'AssessmentQuestionSet', 'AssetSettings', 'AssignmentRules', 'AssistantContextItem', 'AssistantDefinition', 'AssistantSkillQuickAction', 'AssistantSkillSobjectAction', 'AssistantVersion', 'AssociationEngineSettings', 'AttributeDefinition2', 'Audience', 'AuraDefinitionBundle', 'AuthProvider', 'AutomatedContactsSettings', 'AutoResponseRules', 'BatchCalcJobDefinition', 'BatchProcessJobDefinition', 'BenefitAction', 'BillingSettings', 'BlacklistedConsumer', 'BldgEnrgyIntensityCnfg', 'BlockchainSettings', 'Bot', 'BotBlock', 'BotBlockVersion', 'BotSettings', 'BotTemplate', 'BotVersion', 'BranchManagementSettings', 'BrandingSet', 'BriefcaseDefinition', 'BusinessHoursSettings', 'BusinessProcess', 'BusinessProcessGroup', 'BusinessProcessTypeDefinition', 'CallCenter', 'CallCenterRoutingMap', 'CallCoachingMediaProvider', 'CallCtrAgentFavTrfrDest', 'CampaignInfluenceModel', 'CampaignSettings', 'CanvasMetadata', 'CareBenefitVerifySettings', 'CareLimitType', 'CareProviderAfflRoleConfig', 'CareProviderSearchConfig', 'CareRequestConfiguration', 'CareSystemFieldMapping', 'CaseClassificationSettings', 'CaseSettings', 'CaseSubjectParticle', 'Certificate', 'ChannelLayout', 'ChannelObjectLinkingRule', 'ChannelRevMgmtSettings', 'ChatterAnswersSettings', 'ChatterEmailsMDSettings', 'ChatterExtension', 'ChatterSettings', 'ChoiceList', 'ClaimFinancialSettings', 'ClaimMgmtFoundationEnabledSettings', 'ClauseCatgConfiguration', 'CleanDataService', 'CMSConnectSource', 'CmsnStmtLineItemConfig', 'CmsnStmtLineItemTypConfig', 'CodeBuilderSettings', 'CollectionsDashboardSettings', 'CommandAction', 'CommerceSettings', 'CommissionStatementConfig', 'CommonEventSubscription', 'CommsServiceConsoleSettings', 'CommunicationChannelType', 'CommunitiesSettings', 'Community', 'CommunityTemplateDefinition', 'CommunityThemeDefinition', 'CompactLayout', 'CompanySettings', 'ConnectedApp', 'ConnectedAppSettings', 'ConnectedSystem', 'ContentAsset', 'ContentSettings', 'ContentTypeBundle', 'ContextDefinition', 'ContextUseCaseMapping', 'ContractSettings', 'ContractType', 'ConversationalIntelligenceSettings', 'ConversationChannelDefinition', 'ConversationMessageDefinition', 'ConversationServiceIntegrationSettings', 'ConversationVendorFieldDef', 'ConversationVendorInfo', 'ConvIntelligenceSignalRule', 'CorsWhitelistOrigin', 'CspTrustedSite', 'CurrencySettings', 'CustomAddressFieldSettings', 'CustomApplication', 'CustomApplicationComponent', 'CustomDataType', 'CustomerDataPlatformSettings', 'CustomFeedFilter', 'CustomField', 'CustomFieldDisplay', 'CustomHelpMenuSection', 'CustomIndex', 'CustomizablePropensityScoringSettings', 'CustomLabels', 'CustomMetadata', 'CustomNotificationType', 'CustomObject', 'CustomObjectBinding', 'CustomObjectTranslation', 'CustomPageWebLink', 'CustomPermission', 'CustomSite', 'CustomTab', 'CustomValue', 'Dashboard', 'DashboardFolder', 'DataCalcInsightTemplate', 'DataCategoryGroup', 'DataConnectionParamTmpl', 'DataConnector', 'DataConnectorIngestApi', 'DataConnectorS3', 'DataDotComSettings', 'DataImportManagementSettings', 'DataKitObjectDependency', 'DataKitObjectTemplate', 'DataMapping', 'DataMappingFieldDefinition', 'DataMappingObjectDefinition', 'DataMappingSchema', 'DataObjectBuildOrgTemplate', 'DataObjectSearchIndexConf', 'DataPackageKitDefinition', 'DataPackageKitObject', 'DataPipeline', 'DataSource', 'DataSourceBundleDefinition', 'DataSourceObject', 'DataSourceTenant', 'DataSrcDataModelFieldMap', 'DataStreamDefinition', 'DataStreamTemplate', 'DataWeaveResource', 'DecisionFlow', 'DecisionFlowSubFlow', 'DecisionMatrixDefinition', 'DecisionMatrixDefinitionVersion', 'DecisionTable', 'DecisionTableDatasetLink', 'DelegateGroup', 'DeploymentSettings', 'DevHubSettings', 'DigitalExperience', 'DigitalExperienceBundle', 'DigitalExperienceBundleSetting', 'DigitalExperienceConfig', 'DisclosureDefinition', 'DisclosureDefinitionVersion', 'DisclosureType', 'DiscoveryAIModel', 'DiscoveryGoal', 'DiscoverySettings', 'DiscoveryStory', 'Document', 'DocumentCategory', 'DocumentCategoryDocumentType', 'DocumentChecklistSettings', 'DocumentFolder', 'DocumentGenerationSetting', 'DocumentTemplate', 'DocumentType', 'DuplicateRule', 'DynamicFormsSettings', 'DynamicFulfillmentOrchestratorSettings', 'DynamicTrigger', 'EACSettings', 'EclairGeoData', 'EinsteinAgentSettings', 'EinsteinAISettings', 'EinsteinAssistantSettings', 'EinsteinCopilotSettings', 'EinsteinDealInsightsSettings', 'EinsteinDocumentCaptureSettings', 'EinsteinGptSettings', 'EmailAdministrationSettings', 'EmailFolder', 'EmailIntegrationSettings', 'EmailServicesFunction', 'EmailTemplate', 'EmailTemplateFolder', 'EmailTemplateSettings', 'EmbeddedServiceBranding', 'EmbeddedServiceConfig', 'EmbeddedServiceFieldService', 'EmbeddedServiceFlowConfig', 'EmbeddedServiceLiveAgent', 'EmbeddedServiceMenuSettings', 'EmployeeDataSyncProfile', 'EmployeeFieldAccessSettings', 'EmployeeUserSettings', 'EnablementMeasureDefinition', 'EnablementProgramDefinition', 'EnblProgramTaskSubCategory', 'EncryptionKeySettings', 'EnhancedNotesSettings', 'EntitlementProcess', 'EntitlementSettings', 'EntitlementTemplate', 'EntityImplements', 'EscalationRules', 'ESignatureConfig', 'ESignatureEnvelopeConfig', 'EssentialsSettings', 'EssentialsTrialOrgSettings', 'EventDelivery', 'EventLogObjectSettings', 'EventRelayConfig', 'EventSettings', 'EventSubscription', 'EvfSettings', 'ExperienceBundle', 'ExperienceBundleSettings', 'ExperiencePropertyTypeBundle', 'ExplainabilityActionDefinition', 'ExplainabilityActionVersion', 'ExplainabilityMsgTemplate', 'ExpressionSetDefinition', 'ExpressionSetDefinitionVersion', 'ExpressionSetMessageToken', 'ExpressionSetObjectAlias', 'ExtDataTranFieldTemplate', 'ExtDataTranObjectTemplate', 'ExternalAIModel', 'ExternalAuthIdentityProvider', 'ExternalClientApplication', 'ExternalClientAppSettings', 'ExternalCredential', 'ExternalDataConnector', 'ExternalDataSource', 'ExternalDataSrcDescriptor', 'ExternalDataTranField', 'ExternalDataTranObject', 'ExternalDocStorageConfig', 'ExternalServiceRegistration', 'ExternalServicesSettings', 'ExternalStoragePrvdConfig', 'ExtlClntAppConfigurablePolicies', 'ExtlClntAppGlobalOauthSettings', 'ExtlClntAppMobileConfigurablePolicies', 'ExtlClntAppMobileSettings', 'ExtlClntAppNotificationSettings', 'ExtlClntAppOauthConfigurablePolicies', 'ExtlClntAppOauthSettings', 'ExtlClntAppPushConfigurablePolicies', 'ExtlClntAppPushSettings', 'ExtlClntAppSamlConfigurablePolicies', 'FeatureParameterBoolean', 'FeatureParameterDate', 'FeatureParameterInteger', 'FederationDataMappingUsage', 'FeedFieldHistory', 'FieldMappingConfig', 'FieldRestrictionRule', 'FieldServiceMobileConfig', 'FieldServiceMobileExtension', 'FieldServiceSettings', 'FieldSet', 'FieldSrcTrgtRelationship', 'FilesConnectSettings', 'FileUploadAndDownloadSecuritySettings', 'FlexiPage', 'Flow', 'FlowCategory', 'FlowDefinition', 'FlowSettings', 'FlowTest', 'ForecastingFilter', 'ForecastingFilterCondition', 'ForecastingGroup', 'ForecastingObjectListSettings', 'ForecastingSettings', 'ForecastingSourceDefinition', 'ForecastingType', 'ForecastingTypeSource', 'Form', 'FormSection', 'FormulaSettings', 'FuelType', 'FuelTypeSustnUom', 'FunctionReference', 'FundraisingConfig', 'GatewayProviderPaymentMethodType', 'GenAiFunction', 'GenAiPlanner', 'GenAiPlannerBundle', 'GenAiPlugin', 'GenAiPluginInstructionDef', 'GenAiPromptTemplate', 'GenAiPromptTemplateActv', 'GlobalPicklistValue', 'GlobalValueSet', 'GlobalValueSetTranslation', 'GoogleAppsSettings', 'Group', 'HerokuAppLinkSettings', 'HerokuIntegrationSettings', 'HighVelocitySalesSettings', 'HomePageComponent', 'HomePageLayout', 'Icon', 'IdeasSettings', 'IdentityProviderSettings', 'IdentityVerificationProcDef', 'IdentityVerificationProcDtl', 'IdentityVerificationProcFld', 'IframeWhiteListUrlSettings', 'InboundCertificate', 'InboundNetworkConnection', 'IncidentMgmtSettings', 'IncludeEstTaxInQuoteCPQSettings', 'IncludeEstTaxInQuoteSettings', 'Index', 'IndMfgSalesAgreementSettings', 'IndustriesAutomotiveSettings', 'IndustriesChannelPartnerInventorySettings', 'IndustriesContextSettings', 'IndustriesEinsteinFeatureSettings', 'IndustriesEventOrchSettings', 'IndustriesFieldServiceSettings', 'IndustriesGamificationSettings', 'IndustriesLoyaltySettings', 'IndustriesLsCommercialSettings', 'IndustriesManufacturingSettings', 'IndustriesPricingSettings', 'IndustriesRatingSettings', 'IndustriesSettings', 'IndustriesUnifiedInventorySettings', 'IndustriesUnifiedPromotionsSettings', 'IndustriesUsageSettings', 'InsPlcyCoverageSpecConfig', 'InsPlcyLineOfBusConfig', 'InsPolicyLifecycleConfig', 'InsPolicyManagementConfig', 'InsRatePlanCmsnConfig', 'InsRatePlanTypeConfig', 'InstalledPackage', 'InsuranceBrokerageSettings', 'IntegrationHubSettings', 'IntegrationHubSettingsType', 'IntegrationProviderDef', 'InterestTaggingSettings', 'InternalDataConnector', 'InternalOrganization', 'InventoryReplenishmentSettings', 'InventorySettings', 'InvLatePymntRiskCalcSettings', 'InvocableActionExtension', 'InvocableActionSettings', 'IoTSettings', 'IPAddressRange', 'IsvHammerSettings', 'JournalType', 'KeywordList', 'KnowledgeGenerationSettings', 'KnowledgeSettings', 'LaborCostOptimizationSettings', 'LanguageSettings', 'LargeQuotesandOrdersForRlmSettings', 'Layout', 'LeadConfigSettings', 'LeadConvertSettings', 'LearningAchievementConfig', 'LearningItemType', 'Letterhead', 'LicenseDefinition', 'LicensingSettings', 'LifeSciConfigCategory', 'LifeSciConfigRecord', 'LightningBolt', 'LightningComponentBundle', 'LightningExperienceSettings', 'LightningExperienceTheme', 'LightningMessageChannel', 'LightningOnboardingConfig', 'LightningTypeBundle', 'ListView', 'LiveAgentSettings', 'LiveChatAgentConfig', 'LiveChatButton', 'LiveChatDeployment', 'LiveChatSensitiveDataRule', 'LiveMessageSettings', 'LocationUse', 'LoginFlow', 'LoyaltyProgramSetup', 'MacroSettings', 'MailMergeSettings', 'ManagedContentType', 'ManagedEventSubscription', 'ManagedTopics', 'MapsAndLocationSettings', 'MarketAudienceDefinition', 'MarketingActionSettings', 'MarketingAppExtActivity', 'MarketingAppExtension', 'MarketingResourceType', 'MarketSegmentDefinition', 'MassMail', 'MatchingRules', 'MediaAdSalesSettings', 'MediaAgentSettings', 'MeetingsSettings', 'MessagingChannel', 'MfgProgramTemplate', 'MfgServiceConsoleSettings', 'MilestoneType', 'MktCalcInsightObjectDef', 'MktDataConnection', 'MktDataConnectionCred', 'MktDataConnectionParam', 'MktDataConnectionSrcParam', 'MktDataTranObject', 'MLDataDefinition', 'MlDomain', 'MLPredictionDefinition', 'MLRecommendationDefinition', 'MobileApplicationDetail', 'MobileSecurityAssignment', 'MobileSecurityPolicy', 'MobileSecurityPolicySet', 'MobileSettings', 'MobSecurityCertPinConfig', 'ModerationRule', 'MutingPermissionSet', 'MyDomainDiscoverableLogin', 'MyDomainSettings', 'NamedCredential', 'NameSettings', 'NavigationMenu', 'Network', 'NetworkBranding', 'NotificationsSettings', 'NotificationTypeConfig', 'OauthCustomScope', 'OauthOidcSettings', 'OauthTokenExchangeHandler', 'ObjectHierarchyRelationship', 'ObjectLinkingSettings', 'ObjectSourceTargetMap', 'ObjIntegProviderDefMapping', 'OcrSampleDocument', 'OcrTemplate', 'OmniChannelPricingSettings', 'OmniChannelSettings', 'OmniDataTransform', 'OmniExtTrackingDef', 'OmniIntegrationProcedure', 'OmniInteractionAccessConfig', 'OmniInteractionConfig', 'OmniScript', 'OmniStudioSettings', 'OmniSupervisorConfig', 'OmniTrackingComponentDef', 'OmniTrackingGroup', 'OmniUiCard', 'OnlineSalesSettings', 'OpportunityInsightsSettings', 'OpportunityScoreSettings', 'OpportunitySettings', 'Orchestration', 'OrchestrationContext', 'OrderManagementSettings', 'OrderSettings', 'OrgPreferenceSettings', 'OrgSettings', 'OrgWideEmailAddress', 'OutboundNetworkConnection', 'Package', 'PardotEinsteinSettings', 'PardotSettings', 'PardotTenant', 'ParticipantRole', 'PartyDataModelSettings', 'PathAssistant', 'PathAssistantSettings', 'PaymentGatewayProvider', 'PaymentsIngestEnabledSettings', 'PaymentsManagementEnabledSettings', 'PaymentsSettings', 'PaymentsSharingSettings', 'PermissionSet', 'PermissionSetGroup', 'PermissionSetLicenseDefinition', 'PersonAccountOwnerPowerUser', 'PersonalJourneySettings', 'PersonListSettings', 'PicklistSettings', 'PicklistValue', 'PipelineInspMetricConfig', 'PlatformCachePartition', 'PlatformEncryptionSettings', 'PlatformEventChannel', 'PlatformEventChannelMember', 'PlatformEventSettings', 'PlatformEventSubscriberConfig', 'PlatformSlackSettings', 'PolicyRuleDefinition', 'PolicyRuleDefinitionSet', 'Portal', 'PortalDelegablePermissionSet', 'PortalsSettings', 'PostTemplate', 'PredictionBuilderSettings', 'PresenceDeclineReason', 'PresenceUserConfig', 'PricingActionParameters', 'PricingRecipe', 'PrivacySettings', 'PrivateConnection', 'ProcedureOutputResolution', 'ProcessFlowMigration', 'ProductAttrDisplayConfig', 'ProductAttributeSet', 'ProductCatalogManagementSettings', 'ProductConfiguratorSettings', 'ProductDiscoverySettings', 'ProductSettings', 'ProductSpecificationRecType', 'ProductSpecificationType', 'ProductSpecificationTypeDefinition', 'Profile', 'ProfilePasswordPolicy', 'ProfileSessionSetting', 'Prompt', 'PublicKeyCertificate', 'PublicKeyCertificateSet', 'Queue', 'QueueRoutingConfig', 'QuickAction', 'QuickTextSettings', 'QuoteSettings', 'RealTimeEventSettings', 'RecAlrtDataSrcExpSetDef', 'RecommendationBuilderSettings', 'RecommendationStrategy', 'RecordActionDeployment', 'RecordAggregationDefinition', 'RecordAlertCategory', 'RecordAlertDataSource', 'RecordAlertTemplate', 'RecordPageSettings', 'RecordType', 'RedirectWhitelistUrl', 'ReferencedDashboard', 'ReferralMarketingSettings', 'RegisteredExternalService', 'RelatedRecordAccessDef', 'RelatedRecordAssocCriteria', 'RelationshipGraphDefinition', 'ReleaseMgmtSettings', 'RemoteSiteSetting', 'Report', 'ReportFolder', 'ReportingTypeConfig', 'ReportType', 'RestrictionRule', 'RetailExecutionSettings', 'RetrievalSummaryDefinition', 'RevenueManagementSettings', 'Role', 'SalesAgreementSettings', 'SalesDealAgentSettings', 'SalesWorkQueueSettings', 'SamlSsoConfig', 'SandboxSettings', 'SceGlobalModelOptOutSettings', 'SchedulingObjective', 'SchedulingRule', 'SchemaSettings', 'Scontrol', 'ScoreCategory', 'ScoreRange', 'SearchCustomization', 'SearchOrgWideObjectConfig', 'SearchSettings', 'SecuritySettings', 'SemanticDefinition', 'SemanticModel', 'ServiceAIRecommendationsSettings', 'ServiceAISetupDefinition', 'ServiceAISetupField', 'ServiceChannel', 'ServiceCloudVoiceSettings', 'ServiceMgmtKnwlgArtclConfig', 'ServiceMgmtKnwlgArtclConfigSettings', 'ServicePresenceStatus', 'ServiceProcess', 'ServiceSetupAssistantSettings', 'SharingCriteriaRule', 'SharingGuestRule', 'SharingOwnerRule', 'SharingReason', 'SharingRules', 'SharingSet', 'SharingSettings', 'SharingTerritoryRule', 'SiteDotCom', 'SiteSettings', 'Skill', 'SkillType', 'SlackApp', 'SlackFeatureConfig', 'SocialCustomerServiceSettings', 'SocialProfileSettings', 'SourceTrackingSettings', 'StageAssignment', 'StageDefinition', 'StandardValue', 'StandardValueSet', 'StandardValueSetTranslation', 'StaticResource', 'StnryAssetEnrgyUseCnfg', 'StnryAssetEnvSrcCnfg', 'StreamingAppDataConnector', 'SubscriptionManagementSettings', 'SummaryLayout', 'SurveySettings', 'SustainabilityUom', 'SustnUomConversion', 'SvcCatalogCategory', 'SvcCatalogFilterCriteria', 'SvcCatalogFulfillmentFlow', 'SvcCatalogItemDef', 'SynonymDictionary', 'SystemNotificationSettings', 'Territory', 'Territory2', 'Territory2Model', 'Territory2Rule', 'Territory2Settings', 'Territory2Type', 'TimelineObjectDefinition', 'TimeSheetTemplate', 'TmfOutboundNotificationSettings', 'TopicsForObjects', 'TrailheadSettings', 'TransactionProcessingType', 'TransactionSecurityPolicy', 'Translations', 'TrialOrgSettings', 'UiFormatSpecificationSet', 'UIObjectRelationConfig', 'UiPlugin', 'UiPreviewMessageTabDef', 'UserAccessPolicy', 'UserAuthCertificate', 'UserCriteria', 'UserEngagementSettings', 'UserInterfaceSettings', 'UserManagementSettings', 'UserProfileSearchScope', 'UserProvisioningConfig', 'ValidationRule', 'VehAssetEnrgyUseCnfg', 'VehicleAssetEmssnSrcCnfg', 'ViewDefinition', 'VirtualVisitConfig', 'VisualizationPlugin', 'VoiceSettings', 'WarrantyLifecycleMgmtSettings', 'WaveAnalyticAssetCollection', 'WaveApplication', 'WaveComponent', 'WaveDashboard', 'WaveDataflow', 'WaveDataset', 'WaveLens', 'WaveRecipe', 'WaveTemplateBundle', 'WaveXmd', 'Web3Settings', 'WebLink', 'WebStoreBundle', 'WebStoreTemplate', 'WebToXSettings', 'WorkDotComSettings', 'Workflow', 'WorkflowAlert', 'WorkflowFieldUpdate', 'WorkflowFlowAction', 'WorkflowFlowAutomation', 'WorkflowKnowledgePublish', 'WorkflowOutboundMessage', 'WorkflowRule', 'WorkflowSend', 'WorkflowTask', 'WorkforceEngagementSettings', 'WorkSkillRouting'];
let metadataTypesAll = [...metadataTypes];

$(document).on('keydown', '.inp_mtd', function (event) {
    let charCode = (event.which) ? event.which : event.keyCode;
    if (charCode == 13) {
        /* let val = $(this).val().trim();
        //console.log('val: ', val);
        if (val) {
            metadataTypes = metadataTypesAll.filter(element => element.toLowerCase().includes(val.toLowerCase()));
        } else {
            metadataTypes = [...metadataTypesAll];
        }
        generateMatadataTypes(val); */
        metadataName = $(this).val().trim();
        //console.log(metadataName);
        $('.download-div-container').addClass('hide');
        fetchMetadatRecords();
    }
});

$(document).on('input', '.inp_mtd', function (e) {
    let val = $(this).val().trim();
    //console.log('val: ', val);

    if(val){
        metadataTypes = metadataTypesAll.filter(element => element.toLowerCase().includes(val.toLowerCase()));
        generateMatadataTypes(val);
    }else{
        metadataTypes = [...metadataTypesAll];
        generateMatadataTypes();
    }
});


function generateMatadataTypes(keyword) {

    let i = 0;
    let trs = `
        <tr class="mt_tr">
            <td class="mt_td_first">
                <input placeholder="Find" class="inp_th inp_mtd"/>
            </td>
        </tr>
    `;
    while (i < metadataTypes.length) {
        let item = metadataTypes[i];
        trs += `
            <tr class="mt_tr">
                <td class="mt_td">
                    ${item}
                </td>
            </tr>
        `;
        i++;
    }
    $('.mt_table').html(trs);
    $('.m_table').removeClass('blur');
    $('.spinner-div').addClass('hide');
    $('.inp_mtd').focus();
    if(keyword){
        $('.inp_mtd').val(keyword);
    }
}

$(document).on('click', '.mt_td', function (e) {
    metadataName = $(this).text().trim();
    //console.log(metadataName);
    $('.download-div-container').addClass('hide');
    fetchMetadatRecords();
});
$(document).on('contextmenu', '.mt_td', function (e){
   e.preventDefault();
   let metaName = $(this).text().trim();
   //console.log('$metaName: ',metaName);
   navigator.clipboard.writeText(metaName).then(function() {
        //console.log('copied : ' + metaName);
    }, function(err) {
        console.error('error copying: ' + err);
        alert('Copying Error - ' + metaName);
    });
});

function fetchMetadatRecords() {
    records = [];
    $('.m_table').addClass('blur');
    $('.spinner-div').removeClass('hide');
    const soapRequest = `<?xml version="1.0" encoding="utf-8"?>
    <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tns="http://soap.sforce.com/2006/04/metadata">
        <soapenv:Header>
            <tns:SessionHeader>
                <tns:sessionId>${sessionId}</tns:sessionId>
            </tns:SessionHeader>
        </soapenv:Header>
        <soapenv:Body>
            <tns:listMetadata>
                <listMetadataQuery>
                    <type>${metadataName}</type>
                    <folder></folder>
                </listMetadataQuery>
                <asOfVersion>64.0</asOfVersion>
            </tns:listMetadata>
        </soapenv:Body>
    </soapenv:Envelope>`;

    fetch(baseUrl + '/services/Soap/m/64.0', {
        method: 'POST',
        headers: {
            'Content-Type': 'text/xml',
            'SOAPAction': 'login',
            'Accept': 'text/xml',
        },
        body: soapRequest,
    }).then(response => response.text()).then(data => {
        //console.log('Xml Response: ', data);
        /* 
        <?xml version="1.0" encoding="UTF-8"?>
        <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns="http://soap.sforce.com/2006/04/metadata">
            <soapenv:Body>
                <listMetadataResponse>
                    <result>
                        <createdById>0055h00000AjUAGAA3</createdById>
                        <createdByName>Learning Trail</createdByName>
                        <createdDate>2024-03-02T12:04:22.000Z</createdDate>
                        <fileName>objects/RefreshEvent__e.object</fileName>
                        <fullName>RefreshEvent__e.Data__c</fullName>
                        <id>00N5h00000JAn6fEAD</id>
                        <lastModifiedById>0055h00000AjUAGAA3</lastModifiedById>
                        <lastModifiedByName>Learning Trail</lastModifiedByName>
                        <lastModifiedDate>2024-03-02T12:04:22.000Z</lastModifiedDate>
                        <manageableState>unmanaged</manageableState>
                        <type>CustomField</type>
                    </result>
                </listMetadataResponse>
            </soapenv:Body>
        </soapenv:Envelope>
        */
        let xmlResponse = data;
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlResponse, "text/xml");

        let xmlParsedRecords = [];
        let recordNodes = xmlDoc.querySelectorAll('result');
        //console.log('$recordNodes: ', recordNodes);
        let faultstring = xmlDoc.querySelector('faultstring');
        //console.log('$faultstring: ', faultstring);
        if (faultstring) {
            //console.log('$faultstring--: ', faultstring);
        }
        recordNodes.forEach(recordNode => {
            let fullName = recordNode.querySelector('fullName').textContent;
            let objectId = recordNode.querySelector('id')?.textContent ? recordNode.querySelector('id').textContent : fullName;
            let xmlParsedRecord = {
                Id: objectId,
                Name: fullName,
                LastModifiedDate: recordNode.querySelector('lastModifiedDate').textContent,
                LastModifiedDateString: getFormattedDateTime(recordNode.querySelector('lastModifiedDate').textContent),
                CreatedDate: getFormattedDateTime(recordNode.querySelector('createdDate').textContent),
                CreatedBy: recordNode.querySelector('createdByName').textContent,
                LastModifiedBy: recordNode.querySelector('lastModifiedByName').textContent
            }

            xmlParsedRecords.push(xmlParsedRecord);
        });
        //console.log('$xmlParsedRecords: ', xmlParsedRecords);
        records = [...xmlParsedRecords];
        records.sort((a, b) => {
            const dateA = new Date(a.LastModifiedDate);
            const dateB = new Date(b.LastModifiedDate);
            return dateB - dateA;
        });
        recordsChunk = [...records];
        generateTable();
    }).catch(error => {
        console.error('Error:', error);
    });
}

function getFormattedDateTime(dateString) {
    let date_time = Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', year: '2-digit', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(dateString));
    date_time = date_time.replaceAll(',', '').toUpperCase().split(' ').join(' ');
    return date_time;
}

$(document).on('input', '.name_inp', function (e) {
    let val = $(this).val().trim();
    //console.log('val: ', val);

    if (val) {
        recordsChunk = records.filter(element => element.Name.toLowerCase().includes(val.toLowerCase()));
    } else {
        recordsChunk = [...records];
    }
    generateTable();
});

$(document).on('click', '.m_name', function (e){
   let m_name = $(this).text().trim();
   //console.log('$m_name: ',m_name);
   navigator.clipboard.writeText(m_name).then(function() {
        //console.log('copied : ' + m_name);
    }, function(err) {
        console.error('error copying: ' + err);
        alert('Copying Error - ' + m_name);
    });
});

$(document).on('input', '.name_lastmodifyby', function (e) {
    let val = $(this).val().trim();
    //console.log('val: ', val);

    if (val) {
        recordsChunk = records.filter(element => element.LastModifiedBy.toLowerCase().includes(val.toLowerCase()));
    } else {
        recordsChunk = [...records];
    }
    generateTable();
});

function generateTable() {
    let i = 0;
    let trs = ``;
    selectedMetadata = [];
    while (i < recordsChunk.length) {
        let item = recordsChunk[i];
        trs += `
            <tr class="m_tr">
                <td class="m_td">
                    <input type="checkbox" data-name="${item.Name}" data-id="${item.Id}" class="${item.Id}_checkbox m-check"/>
                </td>
                <td class="m_td m_name">
                    ${item.Name}
                </td>
                <td class="m_td">
                    ${item.LastModifiedBy}
                </td>
                <td class="m_td">
                    ${item.LastModifiedDateString}
                </td>
                <td class="m_td">
                    ${item.CreatedBy}
                </td>
                <td class="m_td">
                    ${item.CreatedDate}
                </td>
            </tr>
        `;
        i++;
    }
    $('.tbody').html(trs);
    $('.m_table').removeClass('blur');
    $('.spinner-div').addClass('hide');
    document.title = doc_title + `-${metadataName} [ ${recordsChunk.length} ]`;
}

$(document).on('change', '.select-all', function (e) {
    let checked = $(this).prop('checked');
    //console.log('$checked: ', checked);

    if (checked) {
        selectedMetadata = [...recordsChunk];
        //console.log('$selectedMetadata: ', selectedMetadata);
        $('.m-check').prop('checked', 'true');
    } else {
        selectedMetadata = [];
        //console.log('$selectedMetadata: ', selectedMetadata);
        $('.m-check').removeProp('checked', 'false');
    }

    if (selectedMetadata.length) {
        if ($('.download-div-container').hasClass('hide')) {
            $('.download-div-container').removeClass('hide');
        }
        if ( Array.from(metadataTypeFolderExtentionMap.keys()).includes(metadataName)  && selectedMetadata.length == 1) {
            $('.open-div').removeClass('hide');
        } else {
            $('.open-div').addClass('hide');
        }
    } else {
        $('.download-div-container').addClass('hide');
    }
});

let selectedMetadata = [];

$(document).on('change', '.m-check', function (e) {
    let checked = $(this).prop('checked');
    //console.log('$checked: ', checked);
    let mId = $(this).data('id');
    let mName = $(this).data('name');
    //console.log('$mId: ', mId);
    //console.log('$mName: ', mName);

    if (checked) {
        let index = selectedMetadata.findIndex(m => {
            return m.Name == mName;
        });
        //console.log('$index: ', index);
        if (index == -1) {
            let metadata = records.find(m => {
                return m.Name == mName;
            });
            //console.log('$metadata: ', metadata);
            selectedMetadata.push({ ...metadata });
            //console.log('$selectedMetadata: ', selectedMetadata);
        }
    } else {
        let index = selectedMetadata.findIndex(m => {
            return m.Name == mName;
        });
        //console.log('$index: ', index);
        if (index != -1) {
            selectedMetadata.splice(index, 1);
        }
        //console.log('$selectedMetadata: ', selectedMetadata);
    }

    if (selectedMetadata.length) {
        if ($('.download-div-container').hasClass('hide')) {
            $('.download-div-container').removeClass('hide');
        }
        if ( Array.from(metadataTypeFolderExtentionMap.keys()).includes(metadataName)  && selectedMetadata.length == 1) {
            $('.open-div').removeClass('hide');
        } else {
            $('.open-div').addClass('hide');
        }
    } else {
        $('.download-div-container').addClass('hide');
    }

});
$(document).on('click', '.close-icon_4', function (e) {
    $('.small_popup_4').addClass('hide');
    $('.container').removeClass('blur');
    $('.download-div-container').removeClass('hide');
});

$(document).on('click', '.copy-icon_4', async function (e) {
    let text = editor.getSession().getValue();
    navigator.clipboard.writeText(text).then(function () {
        //console.log('Copied.');
        $('.copy-icon_4').removeClass('grey-icon');
        $('.copy-icon_4').addClass('red-icon');

        setTimeout( () => {
            $('.copy-icon_4').removeClass('red-icon');
            $('.copy-icon_4').addClass('grey-icon');
        }, 2000);

    }, function (err) {
        console.error('error copying');
    });
});

$(document).on('click', '.deploy-icon_4', async function (e) {
    $('.deploy-icon_4').css('color','#c4c4c4');
    let textContent = editor.getSession().getValue();

    //console.log('$currentOpenedFilePath: ',currentOpenedFilePath);
    //console.log('$currentOpenedZipBase64: ',currentOpenedZipBase64);

    const updatedBase64Zip = await modifyFileContentAndRezip(currentOpenedFilePath, currentOpenedZipBase64, textContent);
    //console.log("$Updated base64 zip:", updatedBase64Zip);

    const zip = new JSZip();
    const loadedZip = await zip.loadAsync(updatedBase64Zip, { base64: true });

    const file = loadedZip.file(currentOpenedFilePath);

    if (!file) {
        console.error("file not found");
        return;
    }

    const content = await file.async("text");
    //console.log(content);
    showZipTree(updatedBase64Zip);
    deployPackage(updatedBase64Zip);
    
});

async function deployPackage(updatedBase64Zip){
    const myHeaders = new Headers();
    myHeaders.append("Content-Type", "text/xml");
    myHeaders.append("SOAPAction", "deploy");
    myHeaders.append("Accept", "text/xml");

    const raw = `
        <env:Envelope xmlns:xsd="http://www.w3.org/2001/XMLSchema"
              xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
              xmlns:env="http://schemas.xmlsoap.org/soap/envelope/">
            <env:Header>
                <SessionHeader xmlns="http://soap.sforce.com/2006/04/metadata">
                    <sessionId>${sessionId}</sessionId>
                </SessionHeader>
            </env:Header>
            <env:Body>
                <deploy xmlns="http://soap.sforce.com/2006/04/metadata">
                    <ZipFile>${updatedBase64Zip}</ZipFile>
                    <DeployOptions>
                        <allowMissingFiles>true</allowMissingFiles>
                        <autoUpdatePackage>false</autoUpdatePackage>
                        <checkOnly>false</checkOnly>
                        <ignoreWarnings>false</ignoreWarnings>
                        <performRetrieve>false</performRetrieve>
                        <purgeOnDelete>false</purgeOnDelete>
                        <rollbackOnError>true</rollbackOnError>
                        <singlePackage>true</singlePackage>
                    </DeployOptions>
                </deploy>
            </env:Body>
        </env:Envelope>
    `;

    const requestOptions = {
        method: "POST",
        headers: myHeaders,
        body: raw,
        redirect: "follow"
    };
    $('.deploy-icon_4').addClass('fa-spin');
    fetch(baseUrl + "/services/Soap/m/59.0", requestOptions).then((response) => response.text()).then((xmlResponse) => {
        //console.log('Response: ' + xmlResponse);
        //console.log(xmlResponse);
        //console.log('$xmlResponse: ', xmlResponse);

        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlResponse, "text/xml");

        let recordNode = xmlDoc.querySelector('result');
        //console.log('$recordNode: ', recordNode);

        let id = recordNode.querySelector('id').textContent;
        let state = recordNode.querySelector('state').textContent;
        //console.log('$id: ', id);
        //console.log('$state: ', state);

        deployStatusCheck(id);

    }).catch((error) => {
        console.error(error);
    });
}

async function deployStatusCheck(requestId){

    const myHeaders = new Headers();
    myHeaders.append("Content-Type", "text/xml");
    myHeaders.append("SOAPAction", "login");
    myHeaders.append("Accept", "text/xml");

    const raw = `
        <env:Envelope xmlns:xsd="http://www.w3.org/2001/XMLSchema"
                xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                xmlns:env="http://schemas.xmlsoap.org/soap/envelope/">
        <env:Header>
            <SessionHeader xmlns="http://soap.sforce.com/2006/04/metadata">
                <sessionId>${sessionId}</sessionId>
            </SessionHeader>
        </env:Header>
        <env:Body>
            <checkDeployStatus xmlns="http://soap.sforce.com/2006/04/metadata">
                <id>${requestId}</id>
                <includeDetails>true</includeDetails>
            </checkDeployStatus>
        </env:Body>
    </env:Envelope>
    `;

    const requestOptions = {
        method: "POST",
        headers: myHeaders,
        body: raw,
        redirect: "follow"
    };

    fetch(baseUrl + "/services/Soap/m/59.0", requestOptions).then((response) => response.text()).then((xmlResponse) => {
        //console.log('Response: ' + xmlResponse);
        //console.log(xmlResponse);
        //console.log('$xmlResponse: ', xmlResponse);

        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlResponse, "text/xml");

        // Find the main response node
        const responseNode = xmlDoc.querySelector("checkDeployStatusResponse");

        // Extract deployment status
        const status = responseNode.querySelector("status").textContent;
        //console.log("$status:", status);

        
        const componentSuccesses = [];
        responseNode.querySelectorAll("componentSuccesses").forEach(node => {
            componentSuccesses.push({
                changed: node.querySelector("changed")?.textContent || "",
                componentType: node.querySelector("componentType")?.textContent || "",
                created: node.querySelector("created")?.textContent || "",
                createdDate: node.querySelector("createdDate")?.textContent || "",
                deleted: node.querySelector("deleted")?.textContent || "",
                fileName: node.querySelector("fileName")?.textContent || "",
                fullName: node.querySelector("fullName")?.textContent || "",
                id: node.querySelector("id")?.textContent || "",
                success: node.querySelector("success")?.textContent || ""
            });
        });

        
        const componentFailures = [];
        responseNode.querySelectorAll("componentFailures").forEach(node => {
            componentFailures.push({
                changed: node.querySelector("changed")?.textContent || "",
                columnNumber: node.querySelector("columnNumber")?.textContent || "",
                componentType: node.querySelector("componentType")?.textContent || "",
                created: node.querySelector("created")?.textContent || "",
                createdDate: node.querySelector("createdDate")?.textContent || "",
                deleted: node.querySelector("deleted")?.textContent || "",
                fileName: node.querySelector("fileName")?.textContent || "",
                fullName: node.querySelector("fullName")?.textContent || "",
                lineNumber: node.querySelector("lineNumber")?.textContent || "",
                problem: node.querySelector("problem")?.textContent || "",
                problemType: node.querySelector("problemType")?.textContent || "",
                success: node.querySelector("success")?.textContent || ""
            });
        });

        
        const deployResult = {
            status,
            componentSuccesses,
            componentFailures
        };

        //console.log(deployResult);

        if(deployResult.status == 'Succeeded' || deployResult.status == 'Failed'){
            //console.log('%c$COMPLETED:', 'color: green;font-weight: bold', deployResult);
            $('.deploy-icon_4').removeClass('fa-spin');
            if(deployResult.status == 'Succeeded'){
                $('.deploy-icon_4').css('color','#6cd762');
                console.table(deployResult.componentSuccesses);
                
                // const htmlTable = buildSuccessTable(deployResult);
                // $('.small_popup_4_box_heading_div').html(htmlTable);
                // alert(JSON.stringify(deployResult.componentSuccesses, null, 2));

                setTimeout( () => {
                    // alert(JSON.stringify(deployResult.componentFailures, null, 2));
                    const htmlTable = buildSuccessTable(deployResult);
                    // $('.small_popup_4_box_heading_div').html(htmlTable);
                    Swal.fire({
                        title: `<strong style="color:#82d586;font-size: 20px;font-family: monospace;">Deployment Succeeded</strong>`,
                        icon: "success",
                        html: `<p>Success</p>`,
                        showCloseButton: true,
                        showCancelButton: false,
                        showConfirmButton: false,
                        // confirmButtonColor: "#67d16cff",
                        width: 900,
                    });
                }, 100);
            }
            if(deployResult.status == 'Failed'){
                $('.deploy-icon_4').css('color','#eb5656');
                console.table(deployResult.componentFailures);
                setTimeout( () => {
                    // alert(JSON.stringify(deployResult.componentFailures, null, 2));
                    const htmlTable = buildSuccessTable(deployResult);
                    // $('.small_popup_4_box_heading_div').html(htmlTable);
                    Swal.fire({
                        title: `<strong style="color:#ef6e6e;font-size: 20px;font-family: monospace;">Deployment Failed</strong>`,
                        icon: "error",
                        html: htmlTable,
                        showCloseButton: true,
                        showCancelButton: false,
                        showConfirmButton: false,
                        // confirmButtonColor: "#ef6e6e",
                        width: 900,
                    });
                }, 100);
            }
            
        }else{
            //console.log('%c----------------------Checking-Again---------------------', 'color: red;font-weight: bold');
            deployStatusCheck(requestId);
        }

    }).catch((error) => {
        console.error(error);
    });
    
}

function buildSuccessTable(deployResult) {
    const { componentFailures } = deployResult;

    // If no data, return message
    if (!componentFailures || componentFailures.length === 0) {
        return `<p>No successful components found.</p>`;
    }

    // Define column headers
    const headers = [
        "Name",
        "Line",
        "Error"
    ];

    // Start building table
    let html = `
        <table border="1" cellspacing="0" cellpadding="5" style="border-collapse:collapse; width:100%; font-family:Arial; font-size:14px;">
            <thead>
                <tr style="background:#f2f2f2; text-align:left;">
    `;

    // Add table headers
    headers.forEach(header => {
        html += `<th style="padding:8px; border:1px solid #ccc;text-align: center">${header}</th>`;
    });

    html += `
                </tr>
            </thead>
            <tbody>
    `;

    // Add rows dynamically
    componentFailures.forEach(item => {
        html += `<tr>`;
        html += `<td style="padding:8px; border:1px solid #ccc;text-align: center">${item.fullName}</td>`;
        html += `<td style="padding:8px; border:1px solid #ccc;text-align: center">${item.lineNumber}</td>`;
        html += `<td style="padding:8px; border:1px solid #ccc;text-align: center">${item.problem}</td>`;
        html += `</tr>`;
    });

    html += `
            </tbody>
        </table>
    `;

    return html;
}

async function showZipTree(base64ZipData) {
    try {
        const zip = new JSZip();

        // 1. Load the ZIP
        const loadedZip = await zip.loadAsync(base64ZipData, { base64: true });

        //console.log("ZIP File Structure:\n");

        // 2. Iterate through all files and directories
        loadedZip.forEach((relativePath, file) => {
            if (file.dir) {
                //console.log(`📂 ${relativePath}`);  // Directory
            } else {
                //console.log(`  📄 ${relativePath}`); // File
            }
        });

    } catch (err) {
        console.error("Error reading zip:", err);
    }
}

let currentOpenedZipBase64;
let currentOpenedFilePath;
async function extractDocTxt(base64ZipData) {
    try {
        const zip = new JSZip();
        const loadedZip = await zip.loadAsync(base64ZipData, { base64: true });
        let exactPath = `${metadataTypeFolderExtentionMap.get(metadataName).folder}/${selectedMetadata.at(0).Name}.${metadataTypeFolderExtentionMap.get(metadataName).extension}`;
        //console.log('$exactPath: ',exactPath);
        const file = loadedZip.file(exactPath);

        if (!file) {
            console.error("file not found");
            return;
        }

        const content = await file.async("text");
        //console.log(content);
        $('.download-div-container').addClass('hide');
        $('.small_popup_4').removeClass('hide');
        $('.container').addClass('blur');
        $('.small_popup_4_box_heading_div').text(`${selectedMetadata.at(0).Name}.${metadataTypeFolderExtentionMap.get(metadataName).extension}`);
        $('.deploy-icon_4').css('color','#c4c4c4');

        editor = ace.edit(document.querySelector("#editor"));
        editor.setOptions({
            mode: "ace/mode/apex"
        });
        editor.getSession().setValue(content);

        currentOpenedFilePath = exactPath;
        currentOpenedZipBase64 = base64ZipData;

        return content;
    } catch (err) {
        console.error("Error reading zip:", err);
    }
}

async function modifyFileContentAndRezip(filePath, originalBase64Zip, textContent) {
    try {
        const zip = new JSZip();

        // 1. Load the existing ZIP from base64
        const loadedZip = await zip.loadAsync(originalBase64Zip, { base64: true });

        // 2. Check if the file exists
        const file = loadedZip.file(filePath);

        if (!file) {
            throw new Error(`File not found in zip: ${filePath}`);
        }

        // 3. Replace the content
        loadedZip.file(filePath, textContent);

        // 4. Generate a new ZIP as base64
        const updatedBase64Zip = await loadedZip.generateAsync({
            type: "base64",
            compression: "STORE"
        });

        // //console.log("Updated base64 zip:", updatedBase64Zip);

        return updatedBase64Zip;
    } catch (err) {
        console.error("Error modifying zip:", err);
        throw err;
    }
}

$(document).on('click', '.open-btn', function (e) {
    // extractDocTxt('UEsDBBQACAgIABkexVoAAAAAAAAAAAAAAAAWAAAAY2xhc3Nlcy9NeUl0ZXJhYmxlLmNsc22PTQ6CQAyF95yiS93AAfzZuDLRlScYoEiTYSDTglHD3YXBghq7mEle2/e+Nm1qKYPMGmY434+C3qQWgarGYoVOGFTbXsSTu+7hGcFQjafOCMKJWOYWh583YSI8SQKH2g16m0ntQUojQI6EjKUH8iCgbkFBaHO4kZRBbnzdUY452CFiypxoF87Vv/T1m3AsKYlj9d998/WREga7Ea9CKet8ovQorXcMxgFpvwgnLMS/ZGo0I+nm6hNqclaTeJlRrv4FUEsHCDDPoZ3CAAAAlwEAAFBLAwQUAAgICAAZHsVaAAAAAAAAAAAAAAAAHwAAAGNsYXNzZXMvTXlJdGVyYWJsZS5jbHMtbWV0YS54bWxNjcsKwjAQRff5ipC9mfigiKQpRfAL1P2QRg20SeiMpZ9voSLe3bkcOLaZh15OYaSYU6222igZks9dTM9a3a6XzVE1Tti2hPncI5Fc/ES1ejGXEwBlLJoeefRB+zzAzpgKzAGGwNgho3JCLrNY4n2NuGqvjYW/YzWIkd/kWs9xCha+KCz80k58AFBLBwg8Fd37iQAAAK4AAABQSwMEFAAICAgAGR7FWgAAAAAAAAAAAAAAAAsAAABwYWNrYWdlLnhtbE2OzQrCMBCE73mKkrvdKCoqaYoIggfBgz7Atl1rsfmhCdK+vaU/6Jz2W4aZkWmr6+hDja+sSfgyFjwik9uiMmXCH/fzYsdTxeQN8zeWFPVu4xP+CsEdALxFF/unbXKKc6thJcQWxBo0BSwwIFcs6iVD58iP98CadNZXqmt3CdRgVpOE+fdzGdSkjo7aU43eSxh4DIS/RDmtV5t9LCTMxCRMoxX7AlBLBwh1AG7CpQAAAOYAAABQSwECFAAUAAgICAAZHsVaMM+hncIAAACXAQAAFgAAAAAAAAAAAAAAAAAAAAAAY2xhc3Nlcy9NeUl0ZXJhYmxlLmNsc1BLAQIUABQACAgIABkexVo8Fd37iQAAAK4AAAAfAAAAAAAAAAAAAAAAAAYBAABjbGFzc2VzL015SXRlcmFibGUuY2xzLW1ldGEueG1sUEsBAhQAFAAICAgAGR7FWnUAbsKlAAAA5gAAAAsAAAAAAAAAAAAAAAAA3AEAAHBhY2thZ2UueG1sUEsFBgAAAAADAAMAygAAALoCAAAAAA==');
    if (!selectedMetadata.length)
        return;

    $('.open-btn').addClass('imagetotext-progress-btn');

    const myHeaders = new Headers();
    myHeaders.append("Content-Type", "text/xml");
    myHeaders.append("SOAPAction", "login");
    myHeaders.append("Accept", "text/xml");

    let i = 0;
    let members = '';
    while (i < selectedMetadata.length) {
        let item = selectedMetadata[i];
        members += `<members>${item.Name}</members>`;
        i++;
    }

    //console.log('$members: ', members);

    const raw = `
        <env:Envelope xmlns:xsd="http://www.w3.org/2001/XMLSchema"
                    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                    xmlns:env="http://schemas.xmlsoap.org/soap/envelope/">
            <env:Header>
                <SessionHeader xmlns="http://soap.sforce.com/2006/04/metadata">
                    <sessionId>${sessionId}</sessionId>
                </SessionHeader>
            </env:Header>
            <env:Body>
                <retrieve xmlns="http://soap.sforce.com/2006/04/metadata">
                    <retrieveRequest>
                        <apiVersion>59.0</apiVersion>
                        <singlePackage>true</singlePackage>
                        <unpackaged>
                            <types>
                                ${members}
                                <name>${metadataName}</name>
                            </types>
                            <version>59.0</version>
                        </unpackaged>
                    </retrieveRequest>
                </retrieve>
            </env:Body>
        </env:Envelope>
    `;

    const requestOptions = {
        method: "POST",
        headers: myHeaders,
        body: raw,
        redirect: "follow"
    };

    fetch(baseUrl + "/services/Soap/m/59.0", requestOptions).then((response) => response.text()).then((xmlResponse) => {
        //console.log('Response: ' + xmlResponse);
        //console.log(xmlResponse);
        objectNameAndIdMap = new Map();
        //console.log('$xmlResponse: ', xmlResponse);
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlResponse, "text/xml");

        let recordNodes = xmlDoc.querySelectorAll('result');
        //console.log('$recordNodes: ', recordNodes);

        let processId;
        for (let i = 0; i < recordNodes.length; i++) {
            let id = recordNodes[i].querySelector('id').textContent;
            let state = recordNodes[i].querySelector('state').textContent;
            //console.log('$id: ', id);
            //console.log('$state: ', state);
            processId = id;
        }
        if (processId) {
            retrieveMetadataZipToOpen(processId);
        }
    }).catch((error) => {
        console.error(error);
    });
});
$(document).on('click', '.download-btn', function (e) {

    if (!selectedMetadata.length)
        return;

    // $('.m_table').addClass('blur');
    $('.download-btn').addClass('imagetotext-progress-btn');
    $('.imagetotext-progress').removeClass('hide');

    const myHeaders = new Headers();
    myHeaders.append("Content-Type", "text/xml");
    myHeaders.append("SOAPAction", "login");
    myHeaders.append("Accept", "text/xml");

    let i = 0;
    let members = '';
    while (i < selectedMetadata.length) {
        let item = selectedMetadata[i];
        members += `<members>${item.Name}</members>`;
        i++;
    }

    //console.log('$members: ', members);

    const raw = `
        <env:Envelope xmlns:xsd="http://www.w3.org/2001/XMLSchema"
                    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                    xmlns:env="http://schemas.xmlsoap.org/soap/envelope/">
            <env:Header>
                <SessionHeader xmlns="http://soap.sforce.com/2006/04/metadata">
                    <sessionId>${sessionId}</sessionId>
                </SessionHeader>
            </env:Header>
            <env:Body>
                <retrieve xmlns="http://soap.sforce.com/2006/04/metadata">
                    <retrieveRequest>
                        <apiVersion>59.0</apiVersion>
                        <singlePackage>true</singlePackage>
                        <unpackaged>
                            <types>
                                ${members}
                                <name>${metadataName}</name>
                            </types>
                            <version>59.0</version>
                        </unpackaged>
                    </retrieveRequest>
                </retrieve>
            </env:Body>
        </env:Envelope>
    `;

    const requestOptions = {
        method: "POST",
        headers: myHeaders,
        body: raw,
        redirect: "follow"
    };

    fetch(baseUrl + "/services/Soap/m/59.0", requestOptions).then((response) => response.text()).then((xmlResponse) => {
        //console.log('Response: ' + xmlResponse);
        //console.log(xmlResponse);
        objectNameAndIdMap = new Map();
        //console.log('$xmlResponse: ', xmlResponse);
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlResponse, "text/xml");

        let recordNodes = xmlDoc.querySelectorAll('result');
        //console.log('$recordNodes: ', recordNodes);

        let processId;
        for (let i = 0; i < recordNodes.length; i++) {
            let id = recordNodes[i].querySelector('id').textContent;
            let state = recordNodes[i].querySelector('state').textContent;
            //console.log('$id: ', id);
            //console.log('$state: ', state);
            processId = id;
        }
        if (processId) {
            retrieveMetadataZip(processId);
        }
    }).catch((error) => {
        console.error(error);
    });
});

function retrieveMetadataZipToOpen(processId) {

    //console.log('$processId: ', processId);

    const myHeaders = new Headers();
    myHeaders.append("Content-Type", "text/xml");
    myHeaders.append("SOAPAction", "login");
    myHeaders.append("Accept", "text/xml");

    const requestOptions = {
        method: "POST",
        headers: myHeaders,
        body: `
            <env:Envelope xmlns:xsd="http://www.w3.org/2001/XMLSchema"
                        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                        xmlns:env="http://schemas.xmlsoap.org/soap/envelope/">
                <env:Header>
                    <SessionHeader xmlns="http://soap.sforce.com/2006/04/metadata">
                        <sessionId>${sessionId}</sessionId>
                    </SessionHeader>
                </env:Header>
                <env:Body>
                    <checkRetrieveStatus xmlns="http://soap.sforce.com/2006/04/metadata">
                        <id>${processId}</id>
                        <includeZip>true</includeZip>
                    </checkRetrieveStatus>
                </env:Body>
            </env:Envelope>
        `,
        redirect: "follow"
    };
    fetch(baseUrl + `/services/Soap/m/59.0?t=${Date.now()}`, requestOptions).then((response) => response.text()).then((xmlResponse) => {
        //console.log('Response: ' + xmlResponse);
        //console.log(xmlResponse);
        objectNameAndIdMap = new Map();
        //console.log('$xmlResponse: ', xmlResponse);
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlResponse, "text/xml");

        let recordNodes = xmlDoc.querySelectorAll('result');
        //console.log('$recordNodes: ', recordNodes);

        let status;
        let zipFile
        for (let i = 0; i < recordNodes.length; i++) {
            status = recordNodes[i].querySelector('status').textContent;
            zipFile = recordNodes[i].querySelector('zipFile').textContent;
            //console.log('$status: ', status);
            //console.log('$zipFile: ', zipFile);
        }

        if (status == 'InProgress' || status == 'Pending') {
            retrieveMetadataZipToOpen(processId);
        } else {
            //console.log('$SUCCESS-status: ', status);
            //console.log('$SUCCESS-zipFile: ', zipFile);

            if (zipFile) {
                extractDocTxt(zipFile);
                $('.open-btn').removeClass('imagetotext-progress-btn');
            }
        }

    }).catch((error) => {
        console.error(error);
    });
}
function retrieveMetadataZip(processId) {

    //console.log('$processId: ', processId);

    const myHeaders = new Headers();
    myHeaders.append("Content-Type", "text/xml");
    myHeaders.append("SOAPAction", "login");
    myHeaders.append("Accept", "text/xml");

    const requestOptions = {
        method: "POST",
        headers: myHeaders,
        body: `
            <env:Envelope xmlns:xsd="http://www.w3.org/2001/XMLSchema"
                        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                        xmlns:env="http://schemas.xmlsoap.org/soap/envelope/">
                <env:Header>
                    <SessionHeader xmlns="http://soap.sforce.com/2006/04/metadata">
                        <sessionId>${sessionId}</sessionId>
                    </SessionHeader>
                </env:Header>
                <env:Body>
                    <checkRetrieveStatus xmlns="http://soap.sforce.com/2006/04/metadata">
                        <id>${processId}</id>
                        <includeZip>true</includeZip>
                    </checkRetrieveStatus>
                </env:Body>
            </env:Envelope>
        `,
        redirect: "follow"
    };
    fetch(baseUrl + `/services/Soap/m/59.0?t=${Date.now()}`, requestOptions).then((response) => response.text()).then((xmlResponse) => {
        //console.log('Response: ' + xmlResponse);
        //console.log(xmlResponse);
        objectNameAndIdMap = new Map();
        //console.log('$xmlResponse: ', xmlResponse);
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlResponse, "text/xml");

        let recordNodes = xmlDoc.querySelectorAll('result');
        //console.log('$recordNodes: ', recordNodes);

        let status;
        let zipFile
        for (let i = 0; i < recordNodes.length; i++) {
            status = recordNodes[i].querySelector('status').textContent;
            zipFile = recordNodes[i].querySelector('zipFile').textContent;
            //console.log('$status: ', status);
            //console.log('$zipFile: ', zipFile);
        }

        if (status == 'InProgress' || status == 'Pending') {
            retrieveMetadataZip(processId);
        } else {
            //console.log('$SUCCESS-status: ', status);
            //console.log('$SUCCESS-zipFile: ', zipFile);

            if (zipFile) {
                const byteArray = Uint8Array.from(atob(zipFile), c => c.charCodeAt(0));
                const blob = new Blob([byteArray], { type: 'application/zip' });
                let metadataFileName = metadataName + '-[' + selectedMetadata.length + ']-' + new Date().toLocaleString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', hour12: true });
                //console.log(metadataFileName);
                saveAs(blob, `${metadataFileName}.zip`);
                // $('.m_table').removeClass('blur');
                $('.download-btn').removeClass('imagetotext-progress-btn');
                $('.imagetotext-progress').addClass('hide');
            }

        }

    }).catch((error) => {
        console.error(error);
    });
}

function setSessionText() {
    let a = baseUrl + '';
    //console.log('$a: ', a);
    if (a.includes('sandbox')) {
        a = a.substring(0, a.indexOf('.sandbox.'));
        a = a.split('-');
        a = a[a.length - 1];
        //console.log('$a: ', a);
    } else {
        a = a.split('-');
        a = a[0];
        a = a.replaceAll('https://', '');
        //console.log('$a: ', a);
    }

    a = a.toUpperCase();
    //console.log('$environment: ', a);
    doc_title = document.title + ' - ' + a;
    document.title = doc_title;
}