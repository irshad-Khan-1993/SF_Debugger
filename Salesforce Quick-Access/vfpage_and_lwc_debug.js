/**
 * Salesforce Community & Visualforce Deep Debugger Engine
 * Full-scale live tracing of LWC, Visualforce, Apex calls, line numbers,
 * variables, and component hierarchies on Salesforce Experience Cloud & standard pages.
 */
(function () {
  'use strict';

  // ══════════════════════════════════════════════════════════════════════
  // 1. STATE & DATA STORE
  // ══════════════════════════════════════════════════════════════════════
  const DBG = {
    isRecording: true,
    targetTabId: null,
    targetUrl: '',
    apexLogEntries: [],
    rawLogBuffer: '',
    activeLogCategory: 'ALL',
    isRawLogView: false,
    apexCalls: [],
    flowLogs: [],
    components: [],
    watchedExpressions: [],
    autoVariables: new Map(),
    events: [],
    vfCalls: [],
    counters: { 'apex-log': 0, apex: 0, flow: 0, components: 0, vars: 0, events: 0, vf: 0 },
    activeFilter: '',
    onlyErrors: false,
    selectedApexId: null,
    selectedEventId: null,
    selectedComponentTag: null,
    selectedVfId: null,
    viewModes: new Map() // callId -> 'clean' | 'raw'
  };

  // ══════════════════════════════════════════════════════════════════════
  // REAL JS SOURCE CODE REGISTRY (Maps real repo lines & variables)
  // ══════════════════════════════════════════════════════════════════════
  const PRELOADED_REAL_SOURCES = {
    'cma_summarizeCoverages': `import { LightningElement, track, wire, api } from 'lwc';//api added by irshad on 22-October-2026
import coverageDate from '@salesforce/apex/CMA_SummarizeCoveragesController.getCoverageDate';
import contactCoveragesData from '@salesforce/apex/CMA_SummarizeCoveragesController.contactCoverages';
import { downloadLinkFile } from 'c/cma_functionUtility';
import Employer_URL from '@salesforce/label/c.Employer_URL';
import { label } from "c/cma_labelUtility";
// Added by irshad on 22-October-2026 Jira Ticket:CEBT-478 T-1137 – Email Open Enrollment Coverage Summary
import sendSummarizeCoverageEmail from '@salesforce/apex/CMA_AddPodCompController.sendSummarizeCoverageEmail';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
// ended irshad
export default class Cma_summarizeCoverages extends LightningElement {
    @track coverageDateData;
    @track covDate;
    @track medicalPlanList;
    @track contactCoveragesData;
    @track medicalDependentList;
    @track dentalPlanList;
    @track dentalDependentList;
    @track visionPlanList;
    @track visionDependentList;
    @track lifePlanList;
    @track primaryBeneficiaryList;
    @track contingentBeneficiaryList;
    @track secEAPPlanList
    @track voluntaryLifePlanList;
    @track suppLifePrimaryBeneficiaryLst;
    @track suppLifeContingentBeneficiaryLst;
    @track secHSAPlanList;
    @track secFSAPlanList;
    @track totalMonthlyCost = 0;
    @track isSpinnerActive = false;
    @track notAvalMonthlyCost;  //Added by Chandra Prakash for Two EE Cost-CEBT email on 15-May-2024
    @track label = label;
    //Added by irshad on 22-October-2026 Jira Ticket:CEBT-478 T-1137 – Email Open Enrollment Coverage Summary
    @api showOpenEnrollmentEmailModal;
    @api pageName;
    @api isEmployee;
    @api addReason;
    @track isEmailModalVisible = false;
    @track isEmailInfoModalVisible = false;
    @track memberEmail;
    @api defaultCovDate;
    @track emailModalShown = false; 
    //ended by irshad

    get lifeDisclaimer(){
        return label.LT_Life;
       
    }   

    @wire(coverageDate) getCoverageDate({ data, error }) {
        console.log('wire getCoverageDate called');
        console.log('$pageName : ', this.pageName);
        console.log('$addReason : ', this.addReason);
        console.log('$isEmployee : ', this.isEmployee);
        this.isSpinnerActive = true;
        if (data) {
            console.log('data  :-  ',data);
            this.isSpinnerActive = false;
            this.coverageDateData = data.options;
            this.covDate = data.value; 
            if (this.covDate != '') {
                this.contactCoverages(this.covDate);
            }
        } else if (error) {
            console.log(error);
        }
    };
    contactCoverages(CoverageDate) {
        this.isSpinnerActive = true;
        contactCoveragesData({
            covDate: CoverageDate
        }).then(result => {
            console.log('result  :-  ',result);
            this.isSpinnerActive = false;
            this.totalMonthlyCost = 0;
            this.contactCoveragesData = result;

            //Store member's medical coverage data
            this.medicalPlanList = undefined;
            if(this.contactCoveragesData.hasOwnProperty('medicalPlanList') && this.contactCoveragesData.medicalPlanList.length > 0){
                this.medicalPlanList = this.modifyPlanList(this.contactCoveragesData.medicalPlanList[0]);
            }

            //Store dependent's medical coverage data
            this.medicalDependentList = undefined;
            if(this.contactCoveragesData.hasOwnProperty('medicalDependentList') && this.contactCoveragesData.medicalDependentList.length > 0){
                this.medicalDependentList = this.contactCoveragesData.medicalDependentList.map(row => ({
                    ...row,
                    startDate:  row.Start_Date__c,
                    hideOnSummaryNotDropped:  row.Hide_On_Summary__c != 'Dropped' ? true : false,
                }));
            }
            
            //Store member's dental coverage data
            this.dentalPlanList = undefined;
           
            if(this.contactCoveragesData.hasOwnProperty('dentalPlanList') && this.contactCoveragesData.dentalPlanList.length > 0){

                this.dentalPlanList = this.modifyPlanList(this.contactCoveragesData.dentalPlanList[0]);
            }

            //Store dependent's dental coverage 
            this.dentalDependentList = undefined;
            if(this.contactCoveragesData.hasOwnProperty('dentalDependentList') &&  this.contactCoveragesData.dentalDependentList.length > 0){
                this.dentalDependentList = this.contactCoveragesData.dentalDependentList.map(row => ({
                    ...row,
                    startDate:  row.Start_Date__c,
                    hideOnSummaryNotDropped:  row.Hide_On_Summary__c != 'Dropped' ? true : false,
                }));
            }

            
            //store visionPlanList
            this.visionPlanList = undefined
            if(this.contactCoveragesData.hasOwnProperty('visionPlanList') && this.contactCoveragesData.visionPlanList.length > 0){
                this.visionPlanList = this.modifyPlanList( this.contactCoveragesData.visionPlanList[0]);
            }
            this.visionDependentList = undefined;
            if(this.contactCoveragesData.hasOwnProperty('visionDependentList') &&  this.contactCoveragesData.visionDependentList.length > 0){
                this.visionDependentList = this.contactCoveragesData.visionDependentList.map(row => ({
                    ...row,
                    startDate:  row.Start_Date__c,
                    hideOnSummaryNotDropped:  row.Hide_On_Summary__c != 'Dropped' ? true : false,
                }));
            }

            //store lifePlanList
            this.lifePlanList = undefined;
            if(this.contactCoveragesData.hasOwnProperty('lifePlanList') && this.contactCoveragesData.lifePlanList.length > 0){

                this.lifePlanList = this.contactCoveragesData.lifePlanList.map(row => ({
                    ...row,
                    startDate : row.coverage.Start_Date__c,
                    showLifePlanAmount : row.coverage.hasOwnProperty('Plan__r') ? (!row.coverage.Plan__r.Display_Name__c.includes('Dep Life A') ? true : false) : false,
                    showPrimaryBeneficiaries : row.coverage.hasOwnProperty('Plan__r') ? (row.coverage.Plan__r.Display_Name__c == 'Life A' ? true : false) : false,
                   
                }));
                this.lifePlanList.forEach(element => {
                        if(element.coverage.Plan__r.Display_Name__c == 'Life A'){
                            element.coverage.Plan__r.Name = 'Employee Life and AD&D';
                        }
                });
                
            }

            //store primaryBeneficiaryList
            this.primaryBeneficiaryList = undefined;
            if(this.contactCoveragesData.hasOwnProperty('primaryBeneficiaryList') && this.contactCoveragesData.primaryBeneficiaryList.length > 0){
                this.primaryBeneficiaryList = this.contactCoveragesData.primaryBeneficiaryList;
            }

            //store contingentBeneficiaryList
            this.contingentBeneficiaryList = undefined;
            if(this.contactCoveragesData.hasOwnProperty('contingentBeneficiaryList') && this.contactCoveragesData.contingentBeneficiaryList.length > 0){
                this.contingentBeneficiaryList = this.contactCoveragesData.contingentBeneficiaryList;
            }   

            //store secEAPPlanList
            this.secEAPPlanList = undefined;
            if(this.contactCoveragesData.hasOwnProperty('secEAPPlanList') && this.contactCoveragesData.secEAPPlanList.length > 0){
                this.secEAPPlanList = this.contactCoveragesData.secEAPPlanList.map(row => ({
                    ...row,
                    startDate : row.coverage.Start_Date__c,
                }));
            }            
            
            //store voluntaryLifePlanList
            this.voluntaryLifePlanList = undefined
            if(this.contactCoveragesData.hasOwnProperty('voluntaryLifePlanList') && this.contactCoveragesData.voluntaryLifePlanList.length > 0){
                this.voluntaryLifePlanList = this.contactCoveragesData.voluntaryLifePlanList.map(row => ({
                    ...row,
                    showEEVoluntaryLife : row.coverage.hasOwnProperty('Plan__r') ? (row.coverage.Plan__r.Display_Name__c == 'EE Supp Life'  ? 'EE Voluntary Life' : '') : '',
                    showSpouseSuppLife : row.coverage.hasOwnProperty('Plan__r') ? (row.coverage.Plan__r.Display_Name__c == 'Spouse Supp Life'  ? 'Spouse Voluntary Life' : '') : '',
                    planName : row.coverage.hasOwnProperty('Plan__r') ? (row.coverage.Plan__r.Display_Name__c != 'EE Supp Life' && row.coverage.Plan__r.Display_Name__c != 'Spouse Supp Life'  ? row.coverage.Plan__r.Display_Name__c : '') : '',
                    showAmount : row.coverage.hasOwnProperty('Plan__r') ? (row.coverage.Plan__r.Display_Name__c == 'EE Supp Life' || row.coverage.Plan__r.Display_Name__c == 'Spouse Supp Life' || row.coverage.Plan__r.Display_Name__c == 'Dep Supp Life'  ?  row.amount : '') : '',
                    startDate :  row.coverage.Start_Date__c,
                    showPendingVoluntaryAmount : 
                    row.coverage.hasOwnProperty('Plan__r') && row.coverage.hasOwnProperty('Contact__r') ? 
                    /*modified by prateek on 11/20/25 for Jira Ticket Pending Vol Life amounts: to not show pending vol section if requested voluntary amount is blank*/
                    ((row.coverage.Plan__r.Display_Name__c ==  'EE Supp Life'  || row.coverage.Plan__r.Display_Name__c == 'Spouse Supp Life') && (row.coverage.Requested_Voluntary_Amount__c != null) && (row.coverage.Amount__c != row.coverage.Requested_Voluntary_Amount__c) && (row.coverage.Contact__r.Age__c < 65) ? true: false) : '',
                    
                    showPrimaryBeneficiaries : row.coverage.hasOwnProperty('Plan__r') ? (row.coverage.Plan__r.Display_Name__c ==  'EE Supp Life' ? true : false) : false,
                    showContingentBeneficiaries : row.coverage.hasOwnProperty('Plan__r') ? (row.coverage.Plan__r.Display_Name__c ==  'EE Supp Life' ? true : false) : false,
                    isNotDepLife:  row.coverage.hasOwnProperty('Plan__r') && row.coverage.Plan__r.Display_Name__c !=  'Dep Supp Life'  //added by zaheer on 10/24/2024 regarding Remove amount from summary of coverages - CEBT mail
                }));
            }

            //store primaryBeneficiaryList
            this.suppLifePrimaryBeneficiaryLst = undefined;
            if(this.contactCoveragesData.hasOwnProperty('suppLifePrimaryBeneficiaryLst') && this.contactCoveragesData.suppLifePrimaryBeneficiaryLst.length > 0){
                this.suppLifePrimaryBeneficiaryLst = this.contactCoveragesData.suppLifePrimaryBeneficiaryLst;
            }
            
            //store suppLifeContingentBeneficiaryLst
            this.suppLifeContingentBeneficiaryLst = undefined;
            if(this.contactCoveragesData.hasOwnProperty('suppLifeContingentBeneficiaryLst') && this.contactCoveragesData.suppLifeContingentBeneficiaryLst.length > 0){
                this.suppLifeContingentBeneficiaryLst = this.contactCoveragesData.suppLifeContingentBeneficiaryLst;
            }
            
            //store secHSAPlanList
            this.secHSAPlanList = undefined;
            if(this.contactCoveragesData.hasOwnProperty('secHSAPlanList') && this.contactCoveragesData.secHSAPlanList.length > 0){

                this.secHSAPlanList = this.contactCoveragesData.secHSAPlanList.map(row => ({
                    ...row,
                    showAmount : row.coverage.HSA_Amount__c ? row.coverage.HSA_Amount__c : 0,
                    cost: row.coverage.HSA_Amount__c ? row.coverage.HSA_Amount__c / 12 : 0,
                    startDate : row.coverage.Start_Date__c,
                }));
            }

            //store secFSAPlanList
            this.secFSAPlanList = undefined;
            if(this.contactCoveragesData.hasOwnProperty('secFSAPlanList') && this.contactCoveragesData.secFSAPlanList.length > 0){
                this.secFSAPlanList = this.contactCoveragesData.secFSAPlanList.map(row => ({
                    ...row,
                    amount : row.coverage.FSA_Amount__c ? row.coverage.FSA_Amount__c : 0,
                    cost: row.coverage.FSA_Amount__c ? row.coverage.FSA_Amount__c / 12: 0,
                    startDate : row.coverage.Start_Date__c,
                }));
            }
            
            this.handleTotalMonthlyCost();
            //Added by irshad on 22-October-2026 Jira Ticket:CEBT-478 T-1137 – Email Open Enrollment Coverage Summary
            if((this.pageName === 'Open Enrollment' && this.addReason === 'Open Enrollment') && this.isEmployee){
                this.openEmailModalAfterLoad();
            }
        }).catch(error => {
            console.log('Error : ',error);
            this.isSpinnerActive = false;
        });
    }

    handleCoverage(event){
        this.isSpinnerActive = true;
        let covDate = event.target.value;
        console.log('OUTPUT : ', covDate);
        this.covDate = covDate;
        this.contactCoverages(covDate);
    }
    handleTotalMonthlyCost(){
        if(this.lifePlanList != undefined && this.lifePlanList.length > 0){
            this.totalMonthlyCost += this.lifePlanList.reduce((a, b) => ({cost: a.cost + b.cost})).cost;
        }
        if(this.voluntaryLifePlanList != undefined && this.voluntaryLifePlanList.length > 0){
            this.totalMonthlyCost += this.voluntaryLifePlanList.reduce((a, b) => ({cost: a.cost + b.cost})).cost;
        }
        if(this.secEAPPlanList != undefined && this.secEAPPlanList.length > 0){
            this.totalMonthlyCost += this.secEAPPlanList.reduce((a, b) => ({cost: a.cost + b.cost})).cost;
        }
    }
    modifyPlanList(planList){
        let planData = Object.assign({}, planList);
        planData.planName = '';
        planData.startDate = '';
        if(planData.hasOwnProperty('coverage')){
            if (planData.coverage.hasOwnProperty('Plan__r') && planData.coverage.Plan__r.hasOwnProperty('Name')) {
                planData.planName = planData.coverage.Plan__r.Name;        
            }
            planData.startDate = planData.coverage.Start_Date__c;
            
        }
        if(!this.contactCoveragesData.showEmployerCost){
            if(this.contactCoveragesData.employee.Employment_Status__c == 'Two employee family contribution' || this.contactCoveragesData.employee.Employment_Status__c == 'Partial employer contribution'){
                planData.notMonthlycost = 'Not Available';
                this.notAvalMonthlyCost = planData.notMonthlycost;
            }else{
                planData.monthlycost = planData.cost;
                this.totalMonthlyCost += planData.monthlycost;
            } 
        }
        
        
        if (planData.hasOwnProperty('summarizeCost')) {
            if(this.contactCoveragesData.employee.Employment_Status__c == 'Two employee family contribution' || this.contactCoveragesData.employee.Employment_Status__c == 'Partial employer contribution'){
              planData.notTotalcost = 'Not Available';
              planData.notEmployeecost = 'Not Available';
              planData.notMonthlycost = 'Not Available';
              this.notAvalMonthlyCost = planData.notMonthlycost;
            }else{
               planData.totalcost = planData.summarizeCost['total-cost'];
               planData.employeecost = planData.summarizeCost['emplyer-cost'];
               planData.monthlycost = planData.summarizeCost.cost;
               this.totalMonthlyCost += planData.monthlycost;
            }             
        }
        return planData;
    }
    
    get isHRP(){
        return this.medicalPlanList && this.medicalPlanList?.planName == 'HRP';
    }

    redirectPrint(){
      try{ 
            let pdfCreateURL = Employer_URL + '/cebtemployees/apex/emply_summarize_coverage_print?id=&isSummarize=true&coverage=' + this.covDate + '&emply=false';
            downloadLinkFile(pdfCreateURL, 'Summarize Coverage');
        }catch(err){
            alert(err.message)
        }   
    }
    //Added by irshad on 22-October-2026 Jira Ticket:CEBT-478 T-1137 – Email Open Enrollment Coverage Summary
    handleSendEmailPreference(event) {
        console.log('$handleSendEmailPreference called!');
        const preference = event.currentTarget.dataset.preference;  
        this.isEmailModalVisible = false;

        if (preference !== 'Yes' && preference !== 'No') return;

        let emailCovDate = this.covDate;
        console.log('$emailCovDate: 1', emailCovDate);

        if (preference === 'Yes' || preference === 'No') {
            console.log('$handleSendEmailPreference: 1');
            console.log('$emailCovDate: 2', emailCovDate);
            const renewalValue = this.getRenewalPendingValue();
            console.log('$renewalValue: 2', renewalValue);
            if (renewalValue) {
                console.log('$handleSendEmailPreference: 2');
                emailCovDate = renewalValue;
                if (this.covDate !== renewalValue) {
                    console.log('$handleSendEmailPreference: 3');
                    this.covDate = renewalValue;              
                    this.contactCoverages(renewalValue);      
                }else {
                    console.log('else 1');
                }
            }else {
                console.log('else 2');
            }
        }else {
            console.log('$handleSendEmailPreference: 4');
        }

        this.isSpinnerActive = true;
        sendSummarizeCoverageEmail({ emailPreference: preference, covDate: emailCovDate })
            .then((result) => {
                this.isSpinnerActive = true;
                console.log('sendSummarizeCoverageEmail called!: result');
                if (preference === 'Yes') {
                    console.log('sendSummarizeCoverageEmail preference = Yes');
                    this.memberEmail = result;
                    this.isEmailInfoModalVisible = true;
                    this.isSpinnerActive = false;

                    this.dispatchEvent(new ShowToastEvent({
                        title: 'Success',
                        message: this.label.LT_Email_Send_Success_Msg_Mobile,
                        variant: 'success'
                    }));
                }
                else if(preference === 'No') {
                    console.log('sendSummarizeCoverageEmail preference = No');
                    this.isSpinnerActive = false;
                }
            })
            .catch(error => {
                console.log('sendSummarizeCoverageEmail called!: error');
                console.error('Error sending OE coverage summary email: ', error);
                this.isSpinnerActive = false;
                this.dispatchEvent(new ShowToastEvent({
                    title: 'Error',
                    message: this.label.LT_Email_Send_Error_Msg_Mobile,
                    variant: 'error'
                }));
            });
    }
    closeEmailInfoModal() {
        this.isEmailInfoModalVisible = false;
    }
    openEmailModalAfterLoad() {
            console.log('openEmailModalAfterLoad: this.showOpenEnrollmentEmailModal',  this.showOpenEnrollmentEmailModal);
            const shouldShow = this.showOpenEnrollmentEmailModal === true ||
                            this.showOpenEnrollmentEmailModal === 'true';
            if (!shouldShow || this.emailModalShown) {
                console.log('$1: openEmailModalAfterLoad: shouldShow',  shouldShow);
                console.log('$1: openEmailModalAfterLoad: this.emailModalShown',  this.emailModalShown);
                return;
            }
            console.log('$2: openEmailModalAfterLoad: this.emailModalShown',  this.emailModalShown);
            this.emailModalShown = true;

        requestAnimationFrame(() => {
            console.log('$requestAnimationFrame called!');
            setTimeout(() => {
                this.isEmailModalVisible = true;
            }, 50);
        });
    }

    getRenewalPendingValue() {
        console.log('getRenewalPendingValue called!')
            console.log('$this.defaultCovDate : ', this.defaultCovDate);
        const option = (this.coverageDateData || []).find(
            opt => opt.value && opt.value.includes(this.defaultCovDate)
        );
        return option ? option.value : null;
    }
    // ended by irshad

}`,
    'c-cma_summarize-coverages': `import { LightningElement, track, wire, api } from 'lwc';//api added by irshad on 22-October-2026
import coverageDate from '@salesforce/apex/CMA_SummarizeCoveragesController.getCoverageDate';
import contactCoveragesData from '@salesforce/apex/CMA_SummarizeCoveragesController.contactCoverages';
import { downloadLinkFile } from 'c/cma_functionUtility';
import Employer_URL from '@salesforce/label/c.Employer_URL';
import { label } from "c/cma_labelUtility";
// Added by irshad on 22-October-2026 Jira Ticket:CEBT-478 T-1137 – Email Open Enrollment Coverage Summary
import sendSummarizeCoverageEmail from '@salesforce/apex/CMA_AddPodCompController.sendSummarizeCoverageEmail';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
// ended irshad
export default class Cma_summarizeCoverages extends LightningElement {
    @track coverageDateData;
    @track covDate;
    @track medicalPlanList;
    @track contactCoveragesData;
    @track medicalDependentList;
    @track dentalPlanList;
    @track dentalDependentList;
    @track visionPlanList;
    @track visionDependentList;
    @track lifePlanList;
    @track primaryBeneficiaryList;
    @track contingentBeneficiaryList;
    @track secEAPPlanList
    @track voluntaryLifePlanList;
    @track suppLifePrimaryBeneficiaryLst;
    @track suppLifeContingentBeneficiaryLst;
    @track secHSAPlanList;
    @track secFSAPlanList;
    @track totalMonthlyCost = 0;
    @track isSpinnerActive = false;
    @track notAvalMonthlyCost;  //Added by Chandra Prakash for Two EE Cost-CEBT email on 15-May-2024
    @track label = label;
    //Added by irshad on 22-October-2026 Jira Ticket:CEBT-478 T-1137 – Email Open Enrollment Coverage Summary
    @api showOpenEnrollmentEmailModal;
    @api pageName;
    @api isEmployee;
    @api addReason;
    @track isEmailModalVisible = false;
    @track isEmailInfoModalVisible = false;
    @track memberEmail;
    @api defaultCovDate;
    @track emailModalShown = false; 
    //ended by irshad

    get lifeDisclaimer(){
        return label.LT_Life;
       
    }   

    @wire(coverageDate) getCoverageDate({ data, error }) {
        console.log('wire getCoverageDate called');
        console.log('$pageName : ', this.pageName);
        console.log('$addReason : ', this.addReason);
        console.log('$isEmployee : ', this.isEmployee);
        this.isSpinnerActive = true;
        if (data) {
            console.log('data  :-  ',data);
            this.isSpinnerActive = false;
            this.coverageDateData = data.options;
            this.covDate = data.value; 
            if (this.covDate != '') {
                this.contactCoverages(this.covDate);
            }
        } else if (error) {
            console.log(error);
        }
    };
    contactCoverages(CoverageDate) {
        this.isSpinnerActive = true;
        contactCoveragesData({
            covDate: CoverageDate
        }).then(result => {
            console.log('result  :-  ',result);
            this.isSpinnerActive = false;
            this.totalMonthlyCost = 0;
            this.contactCoveragesData = result;

            //Store member's medical coverage data
            this.medicalPlanList = undefined;
            if(this.contactCoveragesData.hasOwnProperty('medicalPlanList') && this.contactCoveragesData.medicalPlanList.length > 0){
                this.medicalPlanList = this.modifyPlanList(this.contactCoveragesData.medicalPlanList[0]);
            }

            //Store dependent's medical coverage data
            this.medicalDependentList = undefined;
            if(this.contactCoveragesData.hasOwnProperty('medicalDependentList') && this.contactCoveragesData.medicalDependentList.length > 0){
                this.medicalDependentList = this.contactCoveragesData.medicalDependentList.map(row => ({
                    ...row,
                    startDate:  row.Start_Date__c,
                    hideOnSummaryNotDropped:  row.Hide_On_Summary__c != 'Dropped' ? true : false,
                }));
            }
            
            //Store member's dental coverage data
            this.dentalPlanList = undefined;
           
            if(this.contactCoveragesData.hasOwnProperty('dentalPlanList') && this.contactCoveragesData.dentalPlanList.length > 0){

                this.dentalPlanList = this.modifyPlanList(this.contactCoveragesData.dentalPlanList[0]);
            }

            //Store dependent's dental coverage 
            this.dentalDependentList = undefined;
            if(this.contactCoveragesData.hasOwnProperty('dentalDependentList') &&  this.contactCoveragesData.dentalDependentList.length > 0){
                this.dentalDependentList = this.contactCoveragesData.dentalDependentList.map(row => ({
                    ...row,
                    startDate:  row.Start_Date__c,
                    hideOnSummaryNotDropped:  row.Hide_On_Summary__c != 'Dropped' ? true : false,
                }));
            }

            
            //store visionPlanList
            this.visionPlanList = undefined
            if(this.contactCoveragesData.hasOwnProperty('visionPlanList') && this.contactCoveragesData.visionPlanList.length > 0){
                this.visionPlanList = this.modifyPlanList( this.contactCoveragesData.visionPlanList[0]);
            }
            this.visionDependentList = undefined;
            if(this.contactCoveragesData.hasOwnProperty('visionDependentList') &&  this.contactCoveragesData.visionDependentList.length > 0){
                this.visionDependentList = this.contactCoveragesData.visionDependentList.map(row => ({
                    ...row,
                    startDate:  row.Start_Date__c,
                    hideOnSummaryNotDropped:  row.Hide_On_Summary__c != 'Dropped' ? true : false,
                }));
            }

            //store lifePlanList
            this.lifePlanList = undefined;
            if(this.contactCoveragesData.hasOwnProperty('lifePlanList') && this.contactCoveragesData.lifePlanList.length > 0){

                this.lifePlanList = this.contactCoveragesData.lifePlanList.map(row => ({
                    ...row,
                    startDate : row.coverage.Start_Date__c,
                    showLifePlanAmount : row.coverage.hasOwnProperty('Plan__r') ? (!row.coverage.Plan__r.Display_Name__c.includes('Dep Life A') ? true : false) : false,
                    showPrimaryBeneficiaries : row.coverage.hasOwnProperty('Plan__r') ? (row.coverage.Plan__r.Display_Name__c == 'Life A' ? true : false) : false,
                   
                }));
                this.lifePlanList.forEach(element => {
                        if(element.coverage.Plan__r.Display_Name__c == 'Life A'){
                            element.coverage.Plan__r.Name = 'Employee Life and AD&D';
                        }
                });
                
            }

            //store primaryBeneficiaryList
            this.primaryBeneficiaryList = undefined;
            if(this.contactCoveragesData.hasOwnProperty('primaryBeneficiaryList') && this.contactCoveragesData.primaryBeneficiaryList.length > 0){
                this.primaryBeneficiaryList = this.contactCoveragesData.primaryBeneficiaryList;
            }

            //store contingentBeneficiaryList
            this.contingentBeneficiaryList = undefined;
            if(this.contactCoveragesData.hasOwnProperty('contingentBeneficiaryList') && this.contactCoveragesData.contingentBeneficiaryList.length > 0){
                this.contingentBeneficiaryList = this.contactCoveragesData.contingentBeneficiaryList;
            }   

            //store secEAPPlanList
            this.secEAPPlanList = undefined;
            if(this.contactCoveragesData.hasOwnProperty('secEAPPlanList') && this.contactCoveragesData.secEAPPlanList.length > 0){
                this.secEAPPlanList = this.contactCoveragesData.secEAPPlanList.map(row => ({
                    ...row,
                    startDate : row.coverage.Start_Date__c,
                }));
            }            
            
            //store voluntaryLifePlanList
            this.voluntaryLifePlanList = undefined
            if(this.contactCoveragesData.hasOwnProperty('voluntaryLifePlanList') && this.contactCoveragesData.voluntaryLifePlanList.length > 0){
                this.voluntaryLifePlanList = this.contactCoveragesData.voluntaryLifePlanList.map(row => ({
                    ...row,
                    showEEVoluntaryLife : row.coverage.hasOwnProperty('Plan__r') ? (row.coverage.Plan__r.Display_Name__c == 'EE Supp Life'  ? 'EE Voluntary Life' : '') : '',
                    showSpouseSuppLife : row.coverage.hasOwnProperty('Plan__r') ? (row.coverage.Plan__r.Display_Name__c == 'Spouse Supp Life'  ? 'Spouse Voluntary Life' : '') : '',
                    planName : row.coverage.hasOwnProperty('Plan__r') ? (row.coverage.Plan__r.Display_Name__c != 'EE Supp Life' && row.coverage.Plan__r.Display_Name__c != 'Spouse Supp Life'  ? row.coverage.Plan__r.Display_Name__c : '') : '',
                    showAmount : row.coverage.hasOwnProperty('Plan__r') ? (row.coverage.Plan__r.Display_Name__c == 'EE Supp Life' || row.coverage.Plan__r.Display_Name__c == 'Spouse Supp Life' || row.coverage.Plan__r.Display_Name__c == 'Dep Supp Life'  ?  row.amount : '') : '',
                    startDate :  row.coverage.Start_Date__c,
                    showPendingVoluntaryAmount : 
                    row.coverage.hasOwnProperty('Plan__r') && row.coverage.hasOwnProperty('Contact__r') ? 
                    /*modified by prateek on 11/20/25 for Jira Ticket Pending Vol Life amounts: to not show pending vol section if requested voluntary amount is blank*/
                    ((row.coverage.Plan__r.Display_Name__c ==  'EE Supp Life'  || row.coverage.Plan__r.Display_Name__c == 'Spouse Supp Life') && (row.coverage.Requested_Voluntary_Amount__c != null) && (row.coverage.Amount__c != row.coverage.Requested_Voluntary_Amount__c) && (row.coverage.Contact__r.Age__c < 65) ? true: false) : '',
                    
                    showPrimaryBeneficiaries : row.coverage.hasOwnProperty('Plan__r') ? (row.coverage.Plan__r.Display_Name__c ==  'EE Supp Life' ? true : false) : false,
                    showContingentBeneficiaries : row.coverage.hasOwnProperty('Plan__r') ? (row.coverage.Plan__r.Display_Name__c ==  'EE Supp Life' ? true : false) : false,
                    isNotDepLife:  row.coverage.hasOwnProperty('Plan__r') && row.coverage.Plan__r.Display_Name__c !=  'Dep Supp Life'  //added by zaheer on 10/24/2024 regarding Remove amount from summary of coverages - CEBT mail
                }));
            }

            //store primaryBeneficiaryList
            this.suppLifePrimaryBeneficiaryLst = undefined;
            if(this.contactCoveragesData.hasOwnProperty('suppLifePrimaryBeneficiaryLst') && this.contactCoveragesData.suppLifePrimaryBeneficiaryLst.length > 0){
                this.suppLifePrimaryBeneficiaryLst = this.contactCoveragesData.suppLifePrimaryBeneficiaryLst;
            }
            
            //store suppLifeContingentBeneficiaryLst
            this.suppLifeContingentBeneficiaryLst = undefined;
            if(this.contactCoveragesData.hasOwnProperty('suppLifeContingentBeneficiaryLst') && this.contactCoveragesData.suppLifeContingentBeneficiaryLst.length > 0){
                this.suppLifeContingentBeneficiaryLst = this.contactCoveragesData.suppLifeContingentBeneficiaryLst;
            }
            
            //store secHSAPlanList
            this.secHSAPlanList = undefined;
            if(this.contactCoveragesData.hasOwnProperty('secHSAPlanList') && this.contactCoveragesData.secHSAPlanList.length > 0){

                this.secHSAPlanList = this.contactCoveragesData.secHSAPlanList.map(row => ({
                    ...row,
                    showAmount : row.coverage.HSA_Amount__c ? row.coverage.HSA_Amount__c : 0,
                    cost: row.coverage.HSA_Amount__c ? row.coverage.HSA_Amount__c / 12 : 0,
                    startDate : row.coverage.Start_Date__c,
                }));
            }

            //store secFSAPlanList
            this.secFSAPlanList = undefined;
            if(this.contactCoveragesData.hasOwnProperty('secFSAPlanList') && this.contactCoveragesData.secFSAPlanList.length > 0){
                this.secFSAPlanList = this.contactCoveragesData.secFSAPlanList.map(row => ({
                    ...row,
                    amount : row.coverage.FSA_Amount__c ? row.coverage.FSA_Amount__c : 0,
                    cost: row.coverage.FSA_Amount__c ? row.coverage.FSA_Amount__c / 12: 0,
                    startDate : row.coverage.Start_Date__c,
                }));
            }
            
            this.handleTotalMonthlyCost();
            //Added by irshad on 22-October-2026 Jira Ticket:CEBT-478 T-1137 – Email Open Enrollment Coverage Summary
            if((this.pageName === 'Open Enrollment' && this.addReason === 'Open Enrollment') && this.isEmployee){
                this.openEmailModalAfterLoad();
            }
        }).catch(error => {
            console.log('Error : ',error);
            this.isSpinnerActive = false;
        });
    }

    handleCoverage(event){
        this.isSpinnerActive = true;
        let covDate = event.target.value;
        console.log('OUTPUT : ', covDate);
        this.covDate = covDate;
        this.contactCoverages(covDate);
    }
    handleTotalMonthlyCost(){
        if(this.lifePlanList != undefined && this.lifePlanList.length > 0){
            this.totalMonthlyCost += this.lifePlanList.reduce((a, b) => ({cost: a.cost + b.cost})).cost;
        }
        if(this.voluntaryLifePlanList != undefined && this.voluntaryLifePlanList.length > 0){
            this.totalMonthlyCost += this.voluntaryLifePlanList.reduce((a, b) => ({cost: a.cost + b.cost})).cost;
        }
        if(this.secEAPPlanList != undefined && this.secEAPPlanList.length > 0){
            this.totalMonthlyCost += this.secEAPPlanList.reduce((a, b) => ({cost: a.cost + b.cost})).cost;
        }
    }
    modifyPlanList(planList){
        let planData = Object.assign({}, planList);
        planData.planName = '';
        planData.startDate = '';
        if(planData.hasOwnProperty('coverage')){
            if (planData.coverage.hasOwnProperty('Plan__r') && planData.coverage.Plan__r.hasOwnProperty('Name')) {
                planData.planName = planData.coverage.Plan__r.Name;        
            }
            planData.startDate = planData.coverage.Start_Date__c;
            
        }
        if(!this.contactCoveragesData.showEmployerCost){
            if(this.contactCoveragesData.employee.Employment_Status__c == 'Two employee family contribution' || this.contactCoveragesData.employee.Employment_Status__c == 'Partial employer contribution'){
                planData.notMonthlycost = 'Not Available';
                this.notAvalMonthlyCost = planData.notMonthlycost;
            }else{
                planData.monthlycost = planData.cost;
                this.totalMonthlyCost += planData.monthlycost;
            } 
        }
        
        
        if (planData.hasOwnProperty('summarizeCost')) {
            if(this.contactCoveragesData.employee.Employment_Status__c == 'Two employee family contribution' || this.contactCoveragesData.employee.Employment_Status__c == 'Partial employer contribution'){
              planData.notTotalcost = 'Not Available';
              planData.notEmployeecost = 'Not Available';
              planData.notMonthlycost = 'Not Available';
              this.notAvalMonthlyCost = planData.notMonthlycost;
            }else{
               planData.totalcost = planData.summarizeCost['total-cost'];
               planData.employeecost = planData.summarizeCost['emplyer-cost'];
               planData.monthlycost = planData.summarizeCost.cost;
               this.totalMonthlyCost += planData.monthlycost;
            }             
        }
        return planData;
    }
    
    get isHRP(){
        return this.medicalPlanList && this.medicalPlanList?.planName == 'HRP';
    }

    redirectPrint(){
      try{ 
            let pdfCreateURL = Employer_URL + '/cebtemployees/apex/emply_summarize_coverage_print?id=&isSummarize=true&coverage=' + this.covDate + '&emply=false';
            downloadLinkFile(pdfCreateURL, 'Summarize Coverage');
        }catch(err){
            alert(err.message)
        }   
    }
    //Added by irshad on 22-October-2026 Jira Ticket:CEBT-478 T-1137 – Email Open Enrollment Coverage Summary
    handleSendEmailPreference(event) {
        console.log('$handleSendEmailPreference called!');
        const preference = event.currentTarget.dataset.preference;  
        this.isEmailModalVisible = false;

        if (preference !== 'Yes' && preference !== 'No') return;

        let emailCovDate = this.covDate;
        console.log('$emailCovDate: 1', emailCovDate);

        if (preference === 'Yes' || preference === 'No') {
            console.log('$handleSendEmailPreference: 1');
            console.log('$emailCovDate: 2', emailCovDate);
            const renewalValue = this.getRenewalPendingValue();
            console.log('$renewalValue: 2', renewalValue);
            if (renewalValue) {
                console.log('$handleSendEmailPreference: 2');
                emailCovDate = renewalValue;
                if (this.covDate !== renewalValue) {
                    console.log('$handleSendEmailPreference: 3');
                    this.covDate = renewalValue;              
                    this.contactCoverages(renewalValue);      
                }else {
                    console.log('else 1');
                }
            }else {
                console.log('else 2');
            }
        }else {
            console.log('$handleSendEmailPreference: 4');
        }

        this.isSpinnerActive = true;
        sendSummarizeCoverageEmail({ emailPreference: preference, covDate: emailCovDate })
            .then((result) => {
                this.isSpinnerActive = true;
                console.log('sendSummarizeCoverageEmail called!: result');
                if (preference === 'Yes') {
                    console.log('sendSummarizeCoverageEmail preference = Yes');
                    this.memberEmail = result;
                    this.isEmailInfoModalVisible = true;
                    this.isSpinnerActive = false;

                    this.dispatchEvent(new ShowToastEvent({
                        title: 'Success',
                        message: this.label.LT_Email_Send_Success_Msg_Mobile,
                        variant: 'success'
                    }));
                }
                else if(preference === 'No') {
                    console.log('sendSummarizeCoverageEmail preference = No');
                    this.isSpinnerActive = false;
                }
            })
            .catch(error => {
                console.log('sendSummarizeCoverageEmail called!: error');
                console.error('Error sending OE coverage summary email: ', error);
                this.isSpinnerActive = false;
                this.dispatchEvent(new ShowToastEvent({
                    title: 'Error',
                    message: this.label.LT_Email_Send_Error_Msg_Mobile,
                    variant: 'error'
                }));
            });
    }
    closeEmailInfoModal() {
        this.isEmailInfoModalVisible = false;
    }
    openEmailModalAfterLoad() {
            console.log('openEmailModalAfterLoad: this.showOpenEnrollmentEmailModal',  this.showOpenEnrollmentEmailModal);
            const shouldShow = this.showOpenEnrollmentEmailModal === true ||
                            this.showOpenEnrollmentEmailModal === 'true';
            if (!shouldShow || this.emailModalShown) {
                console.log('$1: openEmailModalAfterLoad: shouldShow',  shouldShow);
                console.log('$1: openEmailModalAfterLoad: this.emailModalShown',  this.emailModalShown);
                return;
            }
            console.log('$2: openEmailModalAfterLoad: this.emailModalShown',  this.emailModalShown);
            this.emailModalShown = true;

        requestAnimationFrame(() => {
            console.log('$requestAnimationFrame called!');
            setTimeout(() => {
                this.isEmailModalVisible = true;
            }, 50);
        });
    }

    getRenewalPendingValue() {
        console.log('getRenewalPendingValue called!')
            console.log('$this.defaultCovDate : ', this.defaultCovDate);
        const option = (this.coverageDateData || []).find(
            opt => opt.value && opt.value.includes(this.defaultCovDate)
        );
        return option ? option.value : null;
    }
    // ended by irshad

}`,
    'cma_summarizecoverages': `import { LightningElement, track, wire, api } from 'lwc';//api added by irshad on 22-October-2026
import coverageDate from '@salesforce/apex/CMA_SummarizeCoveragesController.getCoverageDate';
import contactCoveragesData from '@salesforce/apex/CMA_SummarizeCoveragesController.contactCoverages';
import { downloadLinkFile } from 'c/cma_functionUtility';
import Employer_URL from '@salesforce/label/c.Employer_URL';
import { label } from "c/cma_labelUtility";
// Added by irshad on 22-October-2026 Jira Ticket:CEBT-478 T-1137 – Email Open Enrollment Coverage Summary
import sendSummarizeCoverageEmail from '@salesforce/apex/CMA_AddPodCompController.sendSummarizeCoverageEmail';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
// ended irshad
export default class Cma_summarizeCoverages extends LightningElement {
    @track coverageDateData;
    @track covDate;
    @track medicalPlanList;
    @track contactCoveragesData;
    @track medicalDependentList;
    @track dentalPlanList;
    @track dentalDependentList;
    @track visionPlanList;
    @track visionDependentList;
    @track lifePlanList;
    @track primaryBeneficiaryList;
    @track contingentBeneficiaryList;
    @track secEAPPlanList
    @track voluntaryLifePlanList;
    @track suppLifePrimaryBeneficiaryLst;
    @track suppLifeContingentBeneficiaryLst;
    @track secHSAPlanList;
    @track secFSAPlanList;
    @track totalMonthlyCost = 0;
    @track isSpinnerActive = false;
    @track notAvalMonthlyCost;  //Added by Chandra Prakash for Two EE Cost-CEBT email on 15-May-2024
    @track label = label;
    //Added by irshad on 22-October-2026 Jira Ticket:CEBT-478 T-1137 – Email Open Enrollment Coverage Summary
    @api showOpenEnrollmentEmailModal;
    @api pageName;
    @api isEmployee;
    @api addReason;
    @track isEmailModalVisible = false;
    @track isEmailInfoModalVisible = false;
    @track memberEmail;
    @api defaultCovDate;
    @track emailModalShown = false; 
    //ended by irshad

    get lifeDisclaimer(){
        return label.LT_Life;
       
    }   

    @wire(coverageDate) getCoverageDate({ data, error }) {
        console.log('wire getCoverageDate called');
        console.log('$pageName : ', this.pageName);
        console.log('$addReason : ', this.addReason);
        console.log('$isEmployee : ', this.isEmployee);
        this.isSpinnerActive = true;
        if (data) {
            console.log('data  :-  ',data);
            this.isSpinnerActive = false;
            this.coverageDateData = data.options;
            this.covDate = data.value; 
            if (this.covDate != '') {
                this.contactCoverages(this.covDate);
            }
        } else if (error) {
            console.log(error);
        }
    };
    contactCoverages(CoverageDate) {
        this.isSpinnerActive = true;
        contactCoveragesData({
            covDate: CoverageDate
        }).then(result => {
            console.log('result  :-  ',result);
            this.isSpinnerActive = false;
            this.totalMonthlyCost = 0;
            this.contactCoveragesData = result;

            //Store member's medical coverage data
            this.medicalPlanList = undefined;
            if(this.contactCoveragesData.hasOwnProperty('medicalPlanList') && this.contactCoveragesData.medicalPlanList.length > 0){
                this.medicalPlanList = this.modifyPlanList(this.contactCoveragesData.medicalPlanList[0]);
            }

            //Store dependent's medical coverage data
            this.medicalDependentList = undefined;
            if(this.contactCoveragesData.hasOwnProperty('medicalDependentList') && this.contactCoveragesData.medicalDependentList.length > 0){
                this.medicalDependentList = this.contactCoveragesData.medicalDependentList.map(row => ({
                    ...row,
                    startDate:  row.Start_Date__c,
                    hideOnSummaryNotDropped:  row.Hide_On_Summary__c != 'Dropped' ? true : false,
                }));
            }
            
            //Store member's dental coverage data
            this.dentalPlanList = undefined;
           
            if(this.contactCoveragesData.hasOwnProperty('dentalPlanList') && this.contactCoveragesData.dentalPlanList.length > 0){

                this.dentalPlanList = this.modifyPlanList(this.contactCoveragesData.dentalPlanList[0]);
            }

            //Store dependent's dental coverage 
            this.dentalDependentList = undefined;
            if(this.contactCoveragesData.hasOwnProperty('dentalDependentList') &&  this.contactCoveragesData.dentalDependentList.length > 0){
                this.dentalDependentList = this.contactCoveragesData.dentalDependentList.map(row => ({
                    ...row,
                    startDate:  row.Start_Date__c,
                    hideOnSummaryNotDropped:  row.Hide_On_Summary__c != 'Dropped' ? true : false,
                }));
            }

            
            //store visionPlanList
            this.visionPlanList = undefined
            if(this.contactCoveragesData.hasOwnProperty('visionPlanList') && this.contactCoveragesData.visionPlanList.length > 0){
                this.visionPlanList = this.modifyPlanList( this.contactCoveragesData.visionPlanList[0]);
            }
            this.visionDependentList = undefined;
            if(this.contactCoveragesData.hasOwnProperty('visionDependentList') &&  this.contactCoveragesData.visionDependentList.length > 0){
                this.visionDependentList = this.contactCoveragesData.visionDependentList.map(row => ({
                    ...row,
                    startDate:  row.Start_Date__c,
                    hideOnSummaryNotDropped:  row.Hide_On_Summary__c != 'Dropped' ? true : false,
                }));
            }

            //store lifePlanList
            this.lifePlanList = undefined;
            if(this.contactCoveragesData.hasOwnProperty('lifePlanList') && this.contactCoveragesData.lifePlanList.length > 0){

                this.lifePlanList = this.contactCoveragesData.lifePlanList.map(row => ({
                    ...row,
                    startDate : row.coverage.Start_Date__c,
                    showLifePlanAmount : row.coverage.hasOwnProperty('Plan__r') ? (!row.coverage.Plan__r.Display_Name__c.includes('Dep Life A') ? true : false) : false,
                    showPrimaryBeneficiaries : row.coverage.hasOwnProperty('Plan__r') ? (row.coverage.Plan__r.Display_Name__c == 'Life A' ? true : false) : false,
                   
                }));
                this.lifePlanList.forEach(element => {
                        if(element.coverage.Plan__r.Display_Name__c == 'Life A'){
                            element.coverage.Plan__r.Name = 'Employee Life and AD&D';
                        }
                });
                
            }

            //store primaryBeneficiaryList
            this.primaryBeneficiaryList = undefined;
            if(this.contactCoveragesData.hasOwnProperty('primaryBeneficiaryList') && this.contactCoveragesData.primaryBeneficiaryList.length > 0){
                this.primaryBeneficiaryList = this.contactCoveragesData.primaryBeneficiaryList;
            }

            //store contingentBeneficiaryList
            this.contingentBeneficiaryList = undefined;
            if(this.contactCoveragesData.hasOwnProperty('contingentBeneficiaryList') && this.contactCoveragesData.contingentBeneficiaryList.length > 0){
                this.contingentBeneficiaryList = this.contactCoveragesData.contingentBeneficiaryList;
            }   

            //store secEAPPlanList
            this.secEAPPlanList = undefined;
            if(this.contactCoveragesData.hasOwnProperty('secEAPPlanList') && this.contactCoveragesData.secEAPPlanList.length > 0){
                this.secEAPPlanList = this.contactCoveragesData.secEAPPlanList.map(row => ({
                    ...row,
                    startDate : row.coverage.Start_Date__c,
                }));
            }            
            
            //store voluntaryLifePlanList
            this.voluntaryLifePlanList = undefined
            if(this.contactCoveragesData.hasOwnProperty('voluntaryLifePlanList') && this.contactCoveragesData.voluntaryLifePlanList.length > 0){
                this.voluntaryLifePlanList = this.contactCoveragesData.voluntaryLifePlanList.map(row => ({
                    ...row,
                    showEEVoluntaryLife : row.coverage.hasOwnProperty('Plan__r') ? (row.coverage.Plan__r.Display_Name__c == 'EE Supp Life'  ? 'EE Voluntary Life' : '') : '',
                    showSpouseSuppLife : row.coverage.hasOwnProperty('Plan__r') ? (row.coverage.Plan__r.Display_Name__c == 'Spouse Supp Life'  ? 'Spouse Voluntary Life' : '') : '',
                    planName : row.coverage.hasOwnProperty('Plan__r') ? (row.coverage.Plan__r.Display_Name__c != 'EE Supp Life' && row.coverage.Plan__r.Display_Name__c != 'Spouse Supp Life'  ? row.coverage.Plan__r.Display_Name__c : '') : '',
                    showAmount : row.coverage.hasOwnProperty('Plan__r') ? (row.coverage.Plan__r.Display_Name__c == 'EE Supp Life' || row.coverage.Plan__r.Display_Name__c == 'Spouse Supp Life' || row.coverage.Plan__r.Display_Name__c == 'Dep Supp Life'  ?  row.amount : '') : '',
                    startDate :  row.coverage.Start_Date__c,
                    showPendingVoluntaryAmount : 
                    row.coverage.hasOwnProperty('Plan__r') && row.coverage.hasOwnProperty('Contact__r') ? 
                    /*modified by prateek on 11/20/25 for Jira Ticket Pending Vol Life amounts: to not show pending vol section if requested voluntary amount is blank*/
                    ((row.coverage.Plan__r.Display_Name__c ==  'EE Supp Life'  || row.coverage.Plan__r.Display_Name__c == 'Spouse Supp Life') && (row.coverage.Requested_Voluntary_Amount__c != null) && (row.coverage.Amount__c != row.coverage.Requested_Voluntary_Amount__c) && (row.coverage.Contact__r.Age__c < 65) ? true: false) : '',
                    
                    showPrimaryBeneficiaries : row.coverage.hasOwnProperty('Plan__r') ? (row.coverage.Plan__r.Display_Name__c ==  'EE Supp Life' ? true : false) : false,
                    showContingentBeneficiaries : row.coverage.hasOwnProperty('Plan__r') ? (row.coverage.Plan__r.Display_Name__c ==  'EE Supp Life' ? true : false) : false,
                    isNotDepLife:  row.coverage.hasOwnProperty('Plan__r') && row.coverage.Plan__r.Display_Name__c !=  'Dep Supp Life'  //added by zaheer on 10/24/2024 regarding Remove amount from summary of coverages - CEBT mail
                }));
            }

            //store primaryBeneficiaryList
            this.suppLifePrimaryBeneficiaryLst = undefined;
            if(this.contactCoveragesData.hasOwnProperty('suppLifePrimaryBeneficiaryLst') && this.contactCoveragesData.suppLifePrimaryBeneficiaryLst.length > 0){
                this.suppLifePrimaryBeneficiaryLst = this.contactCoveragesData.suppLifePrimaryBeneficiaryLst;
            }
            
            //store suppLifeContingentBeneficiaryLst
            this.suppLifeContingentBeneficiaryLst = undefined;
            if(this.contactCoveragesData.hasOwnProperty('suppLifeContingentBeneficiaryLst') && this.contactCoveragesData.suppLifeContingentBeneficiaryLst.length > 0){
                this.suppLifeContingentBeneficiaryLst = this.contactCoveragesData.suppLifeContingentBeneficiaryLst;
            }
            
            //store secHSAPlanList
            this.secHSAPlanList = undefined;
            if(this.contactCoveragesData.hasOwnProperty('secHSAPlanList') && this.contactCoveragesData.secHSAPlanList.length > 0){

                this.secHSAPlanList = this.contactCoveragesData.secHSAPlanList.map(row => ({
                    ...row,
                    showAmount : row.coverage.HSA_Amount__c ? row.coverage.HSA_Amount__c : 0,
                    cost: row.coverage.HSA_Amount__c ? row.coverage.HSA_Amount__c / 12 : 0,
                    startDate : row.coverage.Start_Date__c,
                }));
            }

            //store secFSAPlanList
            this.secFSAPlanList = undefined;
            if(this.contactCoveragesData.hasOwnProperty('secFSAPlanList') && this.contactCoveragesData.secFSAPlanList.length > 0){
                this.secFSAPlanList = this.contactCoveragesData.secFSAPlanList.map(row => ({
                    ...row,
                    amount : row.coverage.FSA_Amount__c ? row.coverage.FSA_Amount__c : 0,
                    cost: row.coverage.FSA_Amount__c ? row.coverage.FSA_Amount__c / 12: 0,
                    startDate : row.coverage.Start_Date__c,
                }));
            }
            
            this.handleTotalMonthlyCost();
            //Added by irshad on 22-October-2026 Jira Ticket:CEBT-478 T-1137 – Email Open Enrollment Coverage Summary
            if((this.pageName === 'Open Enrollment' && this.addReason === 'Open Enrollment') && this.isEmployee){
                this.openEmailModalAfterLoad();
            }
        }).catch(error => {
            console.log('Error : ',error);
            this.isSpinnerActive = false;
        });
    }

    handleCoverage(event){
        this.isSpinnerActive = true;
        let covDate = event.target.value;
        console.log('OUTPUT : ', covDate);
        this.covDate = covDate;
        this.contactCoverages(covDate);
    }
    handleTotalMonthlyCost(){
        if(this.lifePlanList != undefined && this.lifePlanList.length > 0){
            this.totalMonthlyCost += this.lifePlanList.reduce((a, b) => ({cost: a.cost + b.cost})).cost;
        }
        if(this.voluntaryLifePlanList != undefined && this.voluntaryLifePlanList.length > 0){
            this.totalMonthlyCost += this.voluntaryLifePlanList.reduce((a, b) => ({cost: a.cost + b.cost})).cost;
        }
        if(this.secEAPPlanList != undefined && this.secEAPPlanList.length > 0){
            this.totalMonthlyCost += this.secEAPPlanList.reduce((a, b) => ({cost: a.cost + b.cost})).cost;
        }
    }
    modifyPlanList(planList){
        let planData = Object.assign({}, planList);
        planData.planName = '';
        planData.startDate = '';
        if(planData.hasOwnProperty('coverage')){
            if (planData.coverage.hasOwnProperty('Plan__r') && planData.coverage.Plan__r.hasOwnProperty('Name')) {
                planData.planName = planData.coverage.Plan__r.Name;        
            }
            planData.startDate = planData.coverage.Start_Date__c;
            
        }
        if(!this.contactCoveragesData.showEmployerCost){
            if(this.contactCoveragesData.employee.Employment_Status__c == 'Two employee family contribution' || this.contactCoveragesData.employee.Employment_Status__c == 'Partial employer contribution'){
                planData.notMonthlycost = 'Not Available';
                this.notAvalMonthlyCost = planData.notMonthlycost;
            }else{
                planData.monthlycost = planData.cost;
                this.totalMonthlyCost += planData.monthlycost;
            } 
        }
        
        
        if (planData.hasOwnProperty('summarizeCost')) {
            if(this.contactCoveragesData.employee.Employment_Status__c == 'Two employee family contribution' || this.contactCoveragesData.employee.Employment_Status__c == 'Partial employer contribution'){
              planData.notTotalcost = 'Not Available';
              planData.notEmployeecost = 'Not Available';
              planData.notMonthlycost = 'Not Available';
              this.notAvalMonthlyCost = planData.notMonthlycost;
            }else{
               planData.totalcost = planData.summarizeCost['total-cost'];
               planData.employeecost = planData.summarizeCost['emplyer-cost'];
               planData.monthlycost = planData.summarizeCost.cost;
               this.totalMonthlyCost += planData.monthlycost;
            }             
        }
        return planData;
    }
    
    get isHRP(){
        return this.medicalPlanList && this.medicalPlanList?.planName == 'HRP';
    }

    redirectPrint(){
      try{ 
            let pdfCreateURL = Employer_URL + '/cebtemployees/apex/emply_summarize_coverage_print?id=&isSummarize=true&coverage=' + this.covDate + '&emply=false';
            downloadLinkFile(pdfCreateURL, 'Summarize Coverage');
        }catch(err){
            alert(err.message)
        }   
    }
    //Added by irshad on 22-October-2026 Jira Ticket:CEBT-478 T-1137 – Email Open Enrollment Coverage Summary
    handleSendEmailPreference(event) {
        console.log('$handleSendEmailPreference called!');
        const preference = event.currentTarget.dataset.preference;  
        this.isEmailModalVisible = false;

        if (preference !== 'Yes' && preference !== 'No') return;

        let emailCovDate = this.covDate;
        console.log('$emailCovDate: 1', emailCovDate);

        if (preference === 'Yes' || preference === 'No') {
            console.log('$handleSendEmailPreference: 1');
            console.log('$emailCovDate: 2', emailCovDate);
            const renewalValue = this.getRenewalPendingValue();
            console.log('$renewalValue: 2', renewalValue);
            if (renewalValue) {
                console.log('$handleSendEmailPreference: 2');
                emailCovDate = renewalValue;
                if (this.covDate !== renewalValue) {
                    console.log('$handleSendEmailPreference: 3');
                    this.covDate = renewalValue;              
                    this.contactCoverages(renewalValue);      
                }else {
                    console.log('else 1');
                }
            }else {
                console.log('else 2');
            }
        }else {
            console.log('$handleSendEmailPreference: 4');
        }

        this.isSpinnerActive = true;
        sendSummarizeCoverageEmail({ emailPreference: preference, covDate: emailCovDate })
            .then((result) => {
                this.isSpinnerActive = true;
                console.log('sendSummarizeCoverageEmail called!: result');
                if (preference === 'Yes') {
                    console.log('sendSummarizeCoverageEmail preference = Yes');
                    this.memberEmail = result;
                    this.isEmailInfoModalVisible = true;
                    this.isSpinnerActive = false;

                    this.dispatchEvent(new ShowToastEvent({
                        title: 'Success',
                        message: this.label.LT_Email_Send_Success_Msg_Mobile,
                        variant: 'success'
                    }));
                }
                else if(preference === 'No') {
                    console.log('sendSummarizeCoverageEmail preference = No');
                    this.isSpinnerActive = false;
                }
            })
            .catch(error => {
                console.log('sendSummarizeCoverageEmail called!: error');
                console.error('Error sending OE coverage summary email: ', error);
                this.isSpinnerActive = false;
                this.dispatchEvent(new ShowToastEvent({
                    title: 'Error',
                    message: this.label.LT_Email_Send_Error_Msg_Mobile,
                    variant: 'error'
                }));
            });
    }
    closeEmailInfoModal() {
        this.isEmailInfoModalVisible = false;
    }
    openEmailModalAfterLoad() {
            console.log('openEmailModalAfterLoad: this.showOpenEnrollmentEmailModal',  this.showOpenEnrollmentEmailModal);
            const shouldShow = this.showOpenEnrollmentEmailModal === true ||
                            this.showOpenEnrollmentEmailModal === 'true';
            if (!shouldShow || this.emailModalShown) {
                console.log('$1: openEmailModalAfterLoad: shouldShow',  shouldShow);
                console.log('$1: openEmailModalAfterLoad: this.emailModalShown',  this.emailModalShown);
                return;
            }
            console.log('$2: openEmailModalAfterLoad: this.emailModalShown',  this.emailModalShown);
            this.emailModalShown = true;

        requestAnimationFrame(() => {
            console.log('$requestAnimationFrame called!');
            setTimeout(() => {
                this.isEmailModalVisible = true;
            }, 50);
        });
    }

    getRenewalPendingValue() {
        console.log('getRenewalPendingValue called!')
            console.log('$this.defaultCovDate : ', this.defaultCovDate);
        const option = (this.coverageDateData || []).find(
            opt => opt.value && opt.value.includes(this.defaultCovDate)
        );
        return option ? option.value : null;
    }
    // ended by irshad

}`
  };

  function normalizeCompKey(comp) {
    if (!comp) return '';
    let clean = comp.toLowerCase().replace(/^[<c\-]+/, '').replace(/>$/, '').replace(/[_-]/g, '');
    return clean;
  }

  function getRealSourceFile(compName) {
    if (!compName) return null;
    const clean = normalizeCompKey(compName);
    
    // Check localStorage first
    try {
      const stored = localStorage.getItem('sf_real_source_' + clean);
      if (stored) return stored;
    } catch (e) {}

    // Check preloaded
    for (let k in PRELOADED_REAL_SOURCES) {
      if (normalizeCompKey(k) === clean) {
        return PRELOADED_REAL_SOURCES[k];
      }
    }
    return null;
  }

  function saveRealSourceFile(compName, content) {
    const clean = normalizeCompKey(compName);
    try {
      localStorage.setItem('sf_real_source_' + clean, content);
      PRELOADED_REAL_SOURCES[clean] = content;
      return true;
    } catch (e) {
      return false;
    }
  }

  function parseRealMethodLines(fullSource, methodName) {
    if (!fullSource || !methodName) return null;
    const lines = fullSource.split('\n');
    
    // Search for method declaration in the real file
    // e.g. handleCoverage(event){ or contactCoverages(CoverageDate) { or @wire(...) getCoverageDate(...)
    let startLine = -1;
    let endLine = -1;
    let braceCount = 0;
    let foundStart = false;

    // Pattern to locate method declaration line
    const methodRegex = new RegExp('(?:async\\s+)?(?:get\\s+)?' + methodName + '\\s*\\([^)]*\\)\\s*\\{');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!foundStart) {
        if (methodRegex.test(line) || (line.includes(methodName) && line.includes('(') && line.includes('{'))) {
          startLine = i + 1; // 1-indexed
          foundStart = true;
          // Count initial braces
          for (let ch of line) {
            if (ch === '{') braceCount++;
            if (ch === '}') braceCount--;
          }
          if (braceCount === 0) {
            endLine = startLine;
            break;
          }
        }
      } else {
        for (let ch of line) {
          if (ch === '{') braceCount++;
          if (ch === '}') braceCount--;
        }
        if (braceCount <= 0) {
          endLine = i + 1; // 1-indexed
          break;
        }
      }
    }

    if (startLine !== -1 && endLine !== -1) {
      const methodLines = [];
      for (let j = startLine - 1; j < endLine; j++) {
        methodLines.push({
          lineNum: j + 1,
          code: lines[j]
        });
      }
      return {
        startLine,
        endLine,
        lines: methodLines,
        totalLinesInFile: lines.length
      };
    }

    return null;
  }

  function extractVariablesFromCodeLine(codeLine, step) {
    const results = [];
    if (!codeLine) return results;

    const afterVars = step.afterVariables || step.properties || {};
    const beforeVars = step.beforeVariables || {};
    const changed = step.changedVariables || [];

    // 1. Match this.propertyName
    const thisPropMatches = codeLine.match(/this\.([a-zA-Z0-9_$]+)/g);
    if (thisPropMatches) {
      const seen = new Set();
      thisPropMatches.forEach(m => {
        const prop = m.replace('this.', '');
        if (seen.has(prop)) return;
        seen.add(prop);

        const ch = changed.find(c => c.variable === prop);
        if (ch) {
          results.push({
            name: 'this.' + prop,
            value: ch.newValue,
            oldValue: ch.oldValue,
            isChanged: true
          });
        } else if (afterVars[prop] !== undefined) {
          results.push({
            name: 'this.' + prop,
            value: afterVars[prop],
            isChanged: false
          });
        }
      });
    }

    // 2. Match local variable assignment: let/const/var x = ... or x = ...
    const assignMatch = codeLine.match(/(?:let|const|var)\s+([a-zA-Z0-9_$]+)\s*=\s*([^;]+)/);
    if (assignMatch) {
      const varName = assignMatch[1];
      const expr = assignMatch[2].trim();

      // Check if expr assigns from this.<prop>
      if (expr.startsWith('this.')) {
        const p = expr.replace('this.', '').replace(/;$/, '');
        if (afterVars[p] !== undefined) {
          results.push({
            name: varName,
            value: afterVars[p],
            isChanged: false
          });
        }
      } else if (step.args && step.args[0] && typeof step.args[0] === 'object') {
        // e.g. event.target.value or event.currentTarget.dataset.preference
        if (expr.includes('target.value') && step.args[0].target?.value !== undefined) {
          results.push({
            name: varName,
            value: step.args[0].target.value,
            isChanged: false
          });
        } else if (expr.includes('dataset.') && step.args[0].currentTarget?.dataset) {
          const dsKey = expr.split('dataset.').pop().replace(/;$/, '');
          results.push({
            name: varName,
            value: step.args[0].currentTarget.dataset[dsKey] || '(evaluated at click)',
            isChanged: false
          });
        }
      }
    }

    // 3. Match function arguments passed
    if (step.args && step.args.length) {
      step.args.forEach((arg, idx) => {
        if (typeof arg !== 'function') {
          // Check if argument appears in line
          const argStr = JSON.stringify(arg);
          if (typeof arg === 'string' && codeLine.includes(arg)) {
            results.push({
              name: 'arg[' + idx + ']',
              value: arg,
              isChanged: false
            });
          }
        }
      });
    }

    return results;
  }


  // Extract query parameters passed by popup/script.js
  const urlParams = new URLSearchParams(window.location.search);
  const paramTabId = urlParams.get('targetTabId');
  if (paramTabId) {
    DBG.targetTabId = parseInt(paramTabId, 10);
  }
  DBG.targetUrl = urlParams.get('targetUrl') || window.location.href;
  DBG.baseUrl = urlParams.get('baseUrl') || '';
  DBG.sessionId = urlParams.get('sessionId') || '';

  // ══════════════════════════════════════════════════════════════════════
  // 2. IN-PAGE PROBE FUNCTION (Runs directly in Salesforce tab MAIN world)
  // ══════════════════════════════════════════════════════════════════════
  function pageMainWorldProbe() {
    if (window.__SF_DEEP_DEBUGGER_ACTIVE__) return;
    window.__SF_DEEP_DEBUGGER_ACTIVE__ = true;

    // Cache the original un-wrapped dispatchEvent for internal emissions
    const rawDispatchEvent = EventTarget.prototype.dispatchEvent;

    // Dispatch event to content script / isolated world
    const emit = (type, payload) => {
      try {
        rawDispatchEvent.call(window, new CustomEvent('__SF_DEBUG_DISPATCH__', {
          detail: { source: 'SF_DEBUGGER_PROBE', type, payload }
        }));
      } catch (e) {}
    };

    // Helper: Parse call stack to extract exact line number and function
    function getCallerTrace(skipFrames = 3) {
      try {
        const stack = (new Error()).stack || '';
        const lines = stack.split('\n');
        for (let i = skipFrames; i < lines.length; i++) {
          const line = lines[i];
          if (!line.includes('pageMainWorldProbe') && !line.includes('__SF_') && !line.includes('debugger')) {
            const match = line.match(/(?:at\s+)?(?:(.+?)\s+\()?(?:(.+?):(\d+):(\d+))\)?/);
            if (match) {
              return {
                method: (match[1] || 'anonymous').replace(/^Object\./, ''),
                file: (match[2] || '').split('/').pop().split('?')[0],
                line: parseInt(match[3], 10),
                column: parseInt(match[4], 10),
                raw: line.trim()
              };
            }
          }
        }
      } catch (e) {}
      return { method: 'inline', file: 'unknown', line: 0, column: 0 };
    }

    // ── A. HOOK XHR (Aura / Apex / Visualforce Remoting / UI API) ──
    const originalXHROpen = XMLHttpRequest.prototype.open;
    const originalXHRSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
      this.__sfDebugMeta = {
        method,
        url: String(url),
        startTime: Date.now(),
        id: 'apex_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 5)
      };
      return originalXHROpen.call(this, method, url, ...rest);
    };

    XMLHttpRequest.prototype.send = function (body) {
      if (this.__sfDebugMeta) {
        const meta = this.__sfDebugMeta;
        let parsedParams = body;
        let endpointName = meta.url.split('?')[0].split('/').pop() || 'endpoint';
        let apexActionName = meta.method + ' ' + endpointName;
        let isApex = false;
        let isVisualforce = false;

        // Inspect Salesforce Aura / Apex payload
        if (typeof body === 'string') {
          if (body.startsWith('message=')) {
            try {
              const auraMessage = JSON.parse(decodeURIComponent(body.substring(8)));
              if (auraMessage.actions && auraMessage.actions.length > 0) {
                isApex = true;
                apexActionName = auraMessage.actions.map(a => a.descriptor || a.id).join(', ');
                parsedParams = auraMessage.actions.map(a => ({
                  action: a.descriptor,
                  params: a.params
                }));
              }
            } catch (e) {}
          } else if (body.includes('com.salesforce.visualforce') || body.includes('AJAXREQUEST') || body.includes('pg%3A')) {
            isVisualforce = true;
            // Quick peek at action name in VF form
            const actionMatch = body.match(/pg%3Aj_id\d+%3Afrm%3Aj_id\d+=pg%3Aj_id\d+%3Afrm%3Aj_id\d+/);
            const actionName = actionMatch ? actionMatch[0].split('=')[0].replace(/pg%3Aj_id\d+%3Afrm%3A/, '') : '';
            apexActionName = 'VF Form: ' + endpointName + (actionName ? ` (${actionName})` : '');
          } else {
            try {
              parsedParams = JSON.parse(body);
              if (parsedParams && parsedParams.actions) {
                isApex = true;
                apexActionName = parsedParams.actions.map(a => a.descriptor || a.id).join(', ');
              }
            } catch (e) {}
          }
        }

        if (meta.url.includes('/aura') || meta.url.includes('/sfsites/aura') || meta.url.includes('/apexremote') || meta.url.includes('/services/apexrest/')) {
          isApex = true;
        }

        const trace = getCallerTrace(3);

        emit('APEX_CALL_START', {
          id: meta.id,
          method: apexActionName,
          url: meta.url,
          httpMethod: meta.method,
          params: parsedParams,
          rawBody: body,
          startTime: meta.startTime,
          isApex,
          isVisualforce,
          trace
        });

        emit('APEX_LOG_EVENT', {
          type: 'CALLOUT_REQUEST',
          category: 'CALLOUT',
          scope: isApex ? '[Apex Server]' : (isVisualforce ? '[VF PostBack]' : '[HTTP Request]'),
          title: apexActionName || meta.url.split('/').pop(),
          details: parsedParams ? JSON.stringify(parsedParams) : (body ? String(body).substring(0, 250) : ''),
          url: meta.url,
          params: parsedParams,
          rawBody: body,
          timestamp: meta.startTime
        });

        this.addEventListener('load', function () {
          let responseData = this.responseText;
          try {
            responseData = JSON.parse(this.responseText);
          } catch (e) {}

          const duration = Date.now() - meta.startTime;
          emit('APEX_CALL_END', {
            id: meta.id,
            status: this.status,
            duration,
            response: responseData,
            rawResponseText: this.responseText
          });

          emit('APEX_LOG_EVENT', {
            type: 'CALLOUT_RESPONSE',
            category: 'CALLOUT',
            scope: isApex ? '[Apex Server]' : (isVisualforce ? '[VF PostBack]' : '[HTTP Request]'),
            title: `${this.status} ${this.statusText || 'OK'} (${duration}ms)`,
            details: typeof responseData === 'object' ? JSON.stringify(responseData).substring(0, 300) : String(responseData || '').substring(0, 300),
            response: responseData,
            rawResponseText: this.responseText,
            duration,
            status: this.status,
            timestamp: Date.now()
          });
        });

        this.addEventListener('error', function () {
          emit('APEX_CALL_END', {
            id: meta.id,
            status: 0,
            duration: Date.now() - meta.startTime,
            error: 'Network connection or CORS failure'
          });
        });
      }
      return originalXHRSend.call(this, body);
    };

    // ── B. HOOK FETCH (GraphQL / LWR APIs / Modern Wire Service) ──
    const originalFetch = window.fetch;
    window.fetch = async function (...args) {
      const [input, init] = args;
      const url = typeof input === 'string' ? input : (input?.url || '');
      const reqId = 'fetch_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 5);
      const startTime = Date.now();
      const trace = getCallerTrace(3);

      let body = init?.body;
      try { if (typeof body === 'string') body = JSON.parse(body); } catch (e) {}

      emit('APEX_CALL_START', {
        id: reqId,
        method: (init?.method || 'GET') + ' ' + (url.split('?')[0].split('/').pop() || 'fetch'),
        url,
        httpMethod: init?.method || 'GET',
        params: body,
        rawBody: init?.body,
        startTime,
        isApex: url.includes('/aura') || url.includes('/graphql') || url.includes('/webruntime/'),
        trace
      });

      try {
        const response = await originalFetch.apply(this, args);
        const cloned = response.clone();
        cloned.text().then(txt => {
          let json = txt;
          try { json = JSON.parse(txt); } catch (e) {}
          emit('APEX_CALL_END', {
            id: reqId,
            status: response.status,
            duration: Date.now() - startTime,
            response: json,
            rawResponseText: txt
          });
        }).catch(() => {});
        return response;
      } catch (err) {
        emit('APEX_CALL_END', {
          id: reqId,
          status: 500,
          duration: Date.now() - startTime,
          error: err.message
        });
        throw err;
      }
    };

    // ── C. HOOK LWC CUSTOM ELEMENTS (Method Trapping & Apex-Style Statement Logs) ──
    const hookedPrototypes = new WeakSet();

    function hookPrototypeMethods(componentName, proto) {
      if (!proto || hookedPrototypes.has(proto)) return;
      hookedPrototypes.add(proto);

      const propertyNames = Object.getOwnPropertyNames(proto);
      propertyNames.forEach(prop => {
        if (['constructor', '__lookupGetter__', '__lookupSetter__'].includes(prop)) return;
        try {
          const descriptor = Object.getOwnPropertyDescriptor(proto, prop);
          if (descriptor && typeof descriptor.value === 'function') {
            const originalFn = descriptor.value;
            if (originalFn.__sf_wrapped__) return;

            const wrappedFn = function (...fnArgs) {
              const startTime = Date.now();
              const trace = getCallerTrace(2);
              const stepId = 'flow_' + startTime.toString(36) + '_' + Math.random().toString(36).substr(2, 5);

              // 1. Emit METHOD_ENTRY
              emit('APEX_LOG_EVENT', {
                type: 'METHOD_ENTRY',
                category: 'METHOD',
                scope: `<${componentName}>`,
                title: `.${prop}()`,
                details: fnArgs && fnArgs.length ? JSON.stringify(fnArgs) : 'No arguments',
                file: trace?.file,
                line: trace?.line,
                timestamp: startTime,
                args: fnArgs
              });

              // 2. Snapshot component state variables BEFORE execution
              const beforeVars = {};
              for (let key in this) {
                if (!key.startsWith('_') && typeof this[key] !== 'function') {
                  try {
                    const v = this[key];
                    if (v !== undefined && typeof v !== 'symbol') {
                      beforeVars[key] = JSON.parse(JSON.stringify(v));
                    }
                  } catch (e) {
                    beforeVars[key] = this[key];
                  }
                }
              }

              // 3. Execute function
              let returnValue;
              let executionError = null;
              try {
                returnValue = originalFn.apply(this, fnArgs);
              } catch (err) {
                executionError = err?.message || String(err);
                emit('APEX_LOG_EVENT', {
                  type: 'EXCEPTION_THROWN',
                  category: 'ERROR',
                  scope: `<${componentName}>`,
                  title: `Exception in .${prop}()`,
                  details: executionError,
                  file: trace?.file,
                  line: trace?.line,
                  timestamp: Date.now()
                });
                throw err;
              } finally {
                const endTime = Date.now();
                const duration = endTime - startTime;

                // 4. Snapshot component state variables AFTER execution & compute diffs
                const afterVars = {};
                const changedVariables = [];
                for (let key in this) {
                  if (!key.startsWith('_') && typeof this[key] !== 'function') {
                    try {
                      const v = this[key];
                      if (v !== undefined && typeof v !== 'symbol') {
                        afterVars[key] = JSON.parse(JSON.stringify(v));
                      }
                    } catch (e) {
                      afterVars[key] = this[key];
                    }

                    const beforeStr = JSON.stringify(beforeVars[key]);
                    const afterStr = JSON.stringify(afterVars[key]);
                    if (beforeStr !== afterStr) {
                      const change = {
                        variable: key,
                        oldValue: beforeVars[key],
                        newValue: afterVars[key]
                      };
                      changedVariables.push(change);

                      // Emit VARIABLE_ASSIGNMENT log event
                      emit('APEX_LOG_EVENT', {
                        type: 'VARIABLE_ASSIGNMENT',
                        category: 'VARIABLE',
                        scope: `<${componentName}>`,
                        title: `this.${key}`,
                        details: `${JSON.stringify(change.newValue)} (was ${JSON.stringify(change.oldValue)})`,
                        oldValue: change.oldValue,
                        newValue: change.newValue,
                        variable: key,
                        file: trace?.file,
                        line: trace?.line,
                        timestamp: endTime
                      });
                    }
                  }
                }

                // 5. Source lines & STATEMENT_EXECUTE
                let fnSource = '';
                try {
                  fnSource = originalFn.toString();
                } catch (e) {}

                if (fnSource) {
                  const lines = fnSource.split('\n');
                  const startLine = trace?.line || 1;
                  lines.forEach((lineText, idx) => {
                    const trimmed = lineText.trim();
                    if (trimmed && trimmed !== '{' && trimmed !== '}' && !trimmed.startsWith('//')) {
                      const lNum = startLine + idx;
                      const isVarLine = changedVariables.some(c => lineText.includes(c.variable));
                      if (isVarLine) {
                        emit('APEX_LOG_EVENT', {
                          type: 'STATEMENT_EXECUTE',
                          category: 'STATEMENT',
                          scope: `<${componentName}>`,
                          title: `[Line ${lNum}]`,
                          details: trimmed,
                          file: trace?.file,
                          line: lNum,
                          sourceCode: fnSource,
                          timestamp: endTime
                        });
                      }
                    }
                  });
                }

                // 6. Emit METHOD_EXIT
                emit('APEX_LOG_EVENT', {
                  type: 'METHOD_EXIT',
                  category: 'METHOD',
                  scope: `<${componentName}>`,
                  title: `.${prop}()`,
                  details: `Returned: ${JSON.stringify(returnValue !== undefined ? returnValue : null)} (${duration}ms)`,
                  file: trace?.file,
                  line: trace?.line,
                  timestamp: endTime,
                  duration,
                  returnValue
                });

                // Also populate FLOW_STATEMENT for the JS Code Execution tab
                emit('FLOW_STATEMENT', {
                  id: stepId,
                  component: componentName,
                  method: prop,
                  sourceCode: fnSource,
                  args: fnArgs,
                  beforeVariables: beforeVars,
                  afterVariables: afterVars,
                  changedVariables,
                  returnValue: returnValue !== undefined ? (typeof returnValue === 'object' ? JSON.parse(JSON.stringify(returnValue)) : returnValue) : undefined,
                  error: executionError,
                  timestamp: startTime,
                  trace
                });

                emit('VARIABLE_SNAPSHOT', {
                  component: componentName,
                  properties: afterVars,
                  triggerMethod: prop
                });
              }

              return returnValue;
            };

            wrappedFn.__sf_wrapped__ = true;
            proto[prop] = wrappedFn;
          }
        } catch (e) {}
      });
    }

    // Recursively scan DOM and Shadow DOM to hook all existing components immediately
    function scanAndHookAllComponents(root = document) {
      try {
        const elements = root.querySelectorAll ? root.querySelectorAll('*') : [];
        for (let i = 0; i < elements.length; i++) {
          const el = elements[i];
          const tag = el.tagName ? el.tagName.toLowerCase() : '';
          if (tag.includes('-') && tag !== 'slot') {
            const proto = Object.getPrototypeOf(el);
            if (proto) {
              hookPrototypeMethods(tag, proto);
            }
          }
          if (el.shadowRoot) {
            scanAndHookAllComponents(el.shadowRoot);
          }
        }
      } catch (e) {}
    }

    // Hook future components via customElements.define
    if (window.customElements && window.customElements.define) {
      const originalCustomElementsDefine = window.customElements.define;
      window.customElements.define = function (name, constructor, ...rest) {
        if (name && name.includes('-') && constructor && constructor.prototype) {
          hookPrototypeMethods(name, constructor.prototype);
        }
        return originalCustomElementsDefine.call(this, name, constructor, ...rest);
      };
    }

    // Run immediate scan + periodical + mutation observer
    scanAndHookAllComponents(document.body || document);
    try {
      const domObserver = new MutationObserver(() => {
        scanAndHookAllComponents(document.body || document);
      });
      domObserver.observe(document.documentElement || document.body, { childList: true, subtree: true });
    } catch (e) {}
    setInterval(() => scanAndHookAllComponents(document.body || document), 2500);

    // ── D. HOOK BUTTON CLICKS & CUSTOM EVENTS (Child ➔ Parent Dispatch) ──
    const originalDispatchEvent = EventTarget.prototype.dispatchEvent;
    EventTarget.prototype.dispatchEvent = function (event) {
      if (!event || !event.type) return originalDispatchEvent.call(this, event);

      // CRITICAL: Ignore all internal debugger communication events to prevent infinite recursive loop!
      if (typeof event.type === 'string' && (event.type.startsWith('__SF_') || event.type.includes('DEBUG') || event.type === '__SF_DEBUG_DISPATCH__')) {
        return originalDispatchEvent.call(this, event);
      }

      // Filter out high-frequency noise events
      const noise = ['mousemove', 'pointermove', 'mouseover', 'mouseout', 'mouseenter', 'mouseleave', 'wheel', 'scroll', 'resize', 'keydown', 'keyup', 'keypress', 'touchstart', 'touchmove', 'touchend', 'selectionchange'];
      if (noise.includes(event.type)) {
        return originalDispatchEvent.call(this, event);
      }

      const trace = getCallerTrace(2);
      const targetTag = this.tagName ? this.tagName.toLowerCase() : 'window';

      emit('EVENT_FIRED', {
        type: event.type,
        detail: event.detail !== undefined ? event.detail : null,
        bubbles: event.bubbles,
        composed: event.composed,
        targetTag,
        targetId: this.id || '',
        targetClasses: this.className || '',
        timestamp: Date.now(),
        trace
      });

      emit('APEX_LOG_EVENT', {
        type: 'EVENT_DISPATCH',
        category: 'USER',
        scope: `<${targetTag}>`,
        title: `dispatchEvent("${event.type}")`,
        details: event.detail !== undefined ? JSON.stringify(event.detail) : 'No detail',
        detail: event.detail,
        timestamp: Date.now()
      });

      return originalDispatchEvent.call(this, event);
    };

    // Global click listener for buttons & actions
    document.addEventListener('click', function (e) {
      const target = e.target;
      if (!target) return;
      const tag = target.tagName ? target.tagName.toLowerCase() : '';
      if (tag === 'button' || target.closest('button') || target.getAttribute('role') === 'button' || tag === 'a') {
        const btn = target.closest('button') || target;
        const trace = getCallerTrace(2);
        const btnLabel = (btn.innerText || btn.title || btn.value || '').trim().substring(0, 50);
        emit('ACTION_CLICKED', {
          type: 'click',
          label: btnLabel,
          tag: btn.tagName ? btn.tagName.toLowerCase() : tag,
          id: btn.id || '',
          name: btn.name || '',
          dataset: Object.assign({}, btn.dataset),
          timestamp: Date.now(),
          trace
        });

        emit('APEX_LOG_EVENT', {
          type: 'USER_CLICK',
          category: 'USER',
          scope: `<${btn.tagName ? btn.tagName.toLowerCase() : tag}>`,
          title: `Click: "${btnLabel}"`,
          details: `id="${btn.id || ''}" class="${btn.className || ''}"`,
          timestamp: Date.now()
        });
      }
    }, true);

    // ── E. HOOK VISUALFORCE REMOTING ──
    if (window.Visualforce && window.Visualforce.remoting && window.Visualforce.remoting.Manager) {
      const origRemotingInvoke = window.Visualforce.remoting.Manager.prototype.invokeAction;
      window.Visualforce.remoting.Manager.prototype.invokeAction = function (action, ...args) {
        const reqId = 'vf_' + Date.now().toString(36);
        const startTime = Date.now();
        const trace = getCallerTrace(2);

        let callbackFn = null;
        let cleanArgs = [];
        for (let a of args) {
          if (typeof a === 'function') callbackFn = a;
          else cleanArgs.push(a);
        }

        emit('VF_REMOTING_START', {
          id: reqId,
          action,
          args: cleanArgs,
          startTime,
          trace
        });

        const wrappedCallback = function (result, event) {
          emit('VF_REMOTING_END', {
            id: reqId,
            duration: Date.now() - startTime,
            status: event?.status ? 'SUCCESS' : 'ERROR',
            response: result,
            event
          });
          if (callbackFn) callbackFn(result, event);
        };

        const newArgs = cleanArgs.concat([wrappedCallback]);
        return origRemotingInvoke.call(this, action, ...newArgs);
      };
    }

    // ── F. DYNAMIC COMPONENT TREE SCANNER ──
    window.__SF_SCAN_DOM_COMPONENTS__ = function () {
      const results = [];
      function traverse(node, depth = 0, parentTag = null) {
        if (!node) return;
        const tag = node.tagName ? node.tagName.toLowerCase() : '';
        const isLWC = tag.includes('-') && tag !== 'slot';

        if (isLWC) {
          const compData = {
            tag,
            depth,
            parent: parentTag,
            attributes: {},
            apiProperties: {}
          };

          if (node.attributes) {
            for (let a of node.attributes) {
              compData.attributes[a.name] = a.value;
            }
          }

          try {
            const proto = Object.getPrototypeOf(node);
            if (proto) {
              Object.getOwnPropertyNames(proto).forEach(k => {
                if (k.startsWith('_') || typeof node[k] === 'function') return;
                try {
                  const val = node[k];
                  if (val !== undefined && typeof val !== 'symbol') {
                    compData.apiProperties[k] = val;
                  }
                } catch (e) {}
              });
            }
          } catch (e) {}

          results.push(compData);
        }

        if (node.shadowRoot) {
          for (let child of node.shadowRoot.children) {
            traverse(child, depth + (isLWC ? 1 : 0), isLWC ? tag : parentTag);
          }
        }

        if (node.children) {
          for (let child of node.children) {
            traverse(child, depth + (isLWC ? 1 : 0), isLWC ? tag : parentTag);
          }
        }
      }

      traverse(document.body);
      emit('COMPONENT_TREE_RESULT', results);
      return results;
    };

    // ── G. EXPRESSION EVALUATOR (Watch Expressions) ──
    window.addEventListener('__SF_EVAL_EXPR_REQ__', (e) => {
      const { id, expr } = e.detail || {};
      try {
        const val = eval(expr);
        emit('WATCH_EXPR_RESULT', { id, expr, value: val });
      } catch (err) {
        emit('WATCH_EXPR_RESULT', { id, expr, error: err.message });
      }
    });

    // ── H. HOOK VISUALFORCE USER & ACTION FUNCTIONS ──
    const hookedVfFunctions = new Set();
    function scanAndHookVfFunctions() {
      try {
        const blacklist = new Set([
          'alert', 'prompt', 'confirm', 'open', 'close', 'print', 'focus', 'blur',
          'postMessage', 'addEventListener', 'removeEventListener', 'dispatchEvent',
          'requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'clearTimeout',
          'setInterval', 'clearInterval', 'fetch', 'getCallerTrace', 'emit', 'scroll',
          'scrollTo', 'scrollBy', 'moveTo', 'moveBy', 'resizeTo', 'resizeBy'
        ]);

        for (let prop in window) {
          if (blacklist.has(prop) || prop.startsWith('__SF_') || prop.startsWith('webkit') || hookedVfFunctions.has(prop)) {
            continue;
          }

          try {
            const val = window[prop];
            // Identify non-native user-defined functions or apex:actionFunction declared on window
            if (typeof val === 'function' && !val.toString().includes('[native code]')) {
              hookedVfFunctions.add(prop);
              const originalVfFn = val;

              window[prop] = function (...args) {
                const stepId = 'vf_fn_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 5);
                const trace = getCallerTrace(2);
                let fnSource = '';
                try { fnSource = originalVfFn.toString(); } catch (e) {}

                let res;
                let err = null;
                try {
                  res = originalVfFn.apply(this, args);
                } catch (e) {
                  err = e.message || String(e);
                  throw e;
                } finally {
                  emit('FLOW_STATEMENT', {
                    id: stepId,
                    component: 'Visualforce Page',
                    method: prop,
                    sourceCode: fnSource,
                    args,
                    changedVariables: [],
                    returnValue: res !== undefined ? res : null,
                    error: err,
                    timestamp: Date.now(),
                    trace
                  });
                }
                return res;
              };
            }
          } catch (e) {}
        }
      } catch (e) {}
    }

    scanAndHookVfFunctions();
    setInterval(scanAndHookVfFunctions, 3000);

    emit('PROBE_INITIALIZED', { url: window.location.href, title: document.title });
  }


  // ══════════════════════════════════════════════════════════════════════
  // APEX-STYLE DEBUG LOG ENGINE (Execution Sequence, Statements & Variables)
  // ══════════════════════════════════════════════════════════════════════
  function onApexLogEvent(entry) {
    DBG.apexLogEntries.push(entry);
    DBG.counters['apex-log'] = DBG.apexLogEntries.length;
    updateBadge('apex-log', DBG.counters['apex-log']);

    const d = new Date(entry.timestamp);
    const timeStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}.${String(d.getMilliseconds()).padStart(3, '0')}`;
    const nano = (entry.timestamp % 1000000) * 1000;
    const rawLine = `${timeStr} (${nano})|${entry.type}|[${entry.scope}]|${entry.title}|${entry.details || ''}\n`;
    DBG.rawLogBuffer += rawLine;

    const rawPre = document.getElementById('apexLogRawText');
    if (rawPre) {
      rawPre.textContent += rawLine;
      if (document.getElementById('chkAutoScroll').checked) {
        rawPre.parentElement.scrollTop = rawPre.parentElement.scrollHeight;
      }
    }

    renderApexLogItem(entry, DBG.apexLogEntries.length - 1);
  }

  function renderApexLogItem(entry, index) {
    const list = document.getElementById('apexLogList');
    if (!list) return;

    const empty = list.querySelector('.empty-hint');
    if (empty) empty.remove();

    const d = new Date(entry.timestamp);
    const timeStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}.${String(d.getMilliseconds()).padStart(3, '0')}`;

    let pillClass = 'pill-stmt-exec';
    switch (entry.type) {
      case 'METHOD_ENTRY': pillClass = 'pill-method-entry'; break;
      case 'METHOD_EXIT': pillClass = 'pill-method-exit'; break;
      case 'VARIABLE_ASSIGNMENT': pillClass = 'pill-var-assign'; break;
      case 'STATEMENT_EXECUTE': pillClass = 'pill-stmt-exec'; break;
      case 'CALLOUT_REQUEST': pillClass = 'pill-callout-req'; break;
      case 'CALLOUT_RESPONSE': pillClass = 'pill-callout-res'; break;
      case 'USER_CLICK': pillClass = 'pill-user-click'; break;
      case 'EVENT_DISPATCH': pillClass = 'pill-event-disp'; break;
      case 'EXCEPTION_THROWN': pillClass = 'pill-exception'; break;
    }

    const row = document.createElement('div');
    row.className = 'log-row';
    row.dataset.category = entry.category || 'ALL';
    row.dataset.type = entry.type || '';
    row.id = 'apex-log-row-' + index;

    // Filter check
    if (DBG.activeLogCategory !== 'ALL' && entry.category !== DBG.activeLogCategory) {
      row.style.display = 'none';
    }

    row.innerHTML = `
      <div class="log-time-col">${timeStr}</div>
      <div style="flex:1; overflow:hidden;">
        <div style="display:flex; gap:6px; align-items:center;">
          <span class="log-pill ${pillClass}">${escapeHtml(entry.type)}</span>
          <span class="log-scope-col">${escapeHtml(entry.scope)}</span>
          <span style="color:#fff; font-weight:600; font-size:12px;">${escapeHtml(entry.title)}</span>
        </div>
        <div class="log-details-col">${escapeHtml(entry.details || '')}</div>
      </div>
    `;

    row.onclick = () => {
      document.querySelectorAll('#apexLogList .log-row').forEach(r => r.classList.remove('selected'));
      row.classList.add('selected');
      showApexLogDetail(entry);
    };

    list.appendChild(row);

    if (document.getElementById('chkAutoScroll').checked) {
      list.scrollTop = list.scrollHeight;
    }
  }

  function showApexLogDetail(entry) {
    const detail = document.getElementById('apexLogDetail');
    if (!detail) return;

    const d = new Date(entry.timestamp);
    const timeStr = `${d.toLocaleTimeString()}.${String(d.getMilliseconds()).padStart(3, '0')}`;

    let specificContent = '';

    if (entry.type === 'VARIABLE_ASSIGNMENT') {
      specificContent = `
        <div style="margin-bottom:12px;">
          <h4 style="color:var(--accent-green); margin-bottom:8px;">⚡ Variable Assignment (Value Assigned):</h4>
          <div class="var-diff-box">
            <div class="var-diff-item" style="font-size:14px;">
              <span class="var-name-tag">${escapeHtml(entry.title)}:</span>
              <span class="var-old-val">${escapeHtml(JSON.stringify(entry.oldValue))}</span>
              <span class="var-arrow">➔</span>
              <span class="var-new-val">${escapeHtml(JSON.stringify(entry.newValue))}</span>
            </div>
          </div>
        </div>
      `;
    } else if (entry.type === 'STATEMENT_EXECUTE') {
      specificContent = `
        <div style="margin-bottom:12px;">
          <h4 style="color:var(--accent-blue); margin-bottom:8px;">📜 Executed Statement:</h4>
          <div class="code-editor-box">
            <div class="code-editor-header">
              <span>${escapeHtml(entry.file || 'Component.js')}</span>
              <span>Line ${entry.line || '?'}</span>
            </div>
            <pre class="json-view" style="color:var(--accent-green); font-size:13px;">${escapeHtml(entry.details)}</pre>
          </div>
        </div>
      `;
    } else if (entry.type === 'METHOD_ENTRY' || entry.type === 'METHOD_EXIT') {
      specificContent = `
        <div style="margin-bottom:12px;">
          <h4 style="color:var(--accent-purple); margin-bottom:8px;">📥 Method Arguments / Return Value:</h4>
          <pre class="json-view">${highlightJson(entry.args || entry.returnValue || entry.details)}</pre>
        </div>
      `;
    } else if (entry.type === 'CALLOUT_REQUEST' || entry.type === 'CALLOUT_RESPONSE') {
      specificContent = `
        <div style="margin-bottom:12px;">
          <h4 style="color:var(--accent-amber); margin-bottom:8px;">🌐 Server Callout Payload / Response:</h4>
          <pre class="json-view">${highlightJson(entry.params || entry.response || entry.details)}</pre>
        </div>
      `;
    } else if (entry.type === 'EVENT_DISPATCH') {
      specificContent = `
        <div style="margin-bottom:12px;">
          <h4 style="color:var(--accent-amber); margin-bottom:8px;">🎯 Event Detail Payload:</h4>
          <pre class="json-view">${highlightJson(entry.detail || entry.details)}</pre>
        </div>
      `;
    } else if (entry.type === 'EXCEPTION_THROWN') {
      specificContent = `
        <div style="background:#451a1a; border:1px solid var(--accent-red); color:#fca5a5; padding:12px; border-radius:6px; margin-bottom:12px;">
          <strong>⛔ Exception Details:</strong><br>${escapeHtml(entry.details)}
        </div>
      `;
    }

    detail.innerHTML = `
      <div style="margin-bottom:14px; border-bottom:1px solid var(--border-color); padding-bottom:10px;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <h3 style="color:#fff; margin-bottom:4px;">${escapeHtml(entry.title)}</h3>
          <span class="log-pill pill-stmt-exec">${escapeHtml(entry.type)}</span>
        </div>
        <p style="color:var(--text-muted); font-size:11px;">
          Scope: <strong style="color:var(--accent-blue);">${escapeHtml(entry.scope)}</strong> | Time: <strong>${timeStr}</strong>
          ${entry.line ? ` | Line ${entry.line}` : ''}
          ${entry.file ? ` (${escapeHtml(entry.file)})` : ''}
        </p>
      </div>

      ${specificContent}

      <details class="vf-collapsible" open>
        <summary>📋 Raw Apex Log Format</summary>
        <div style="padding-top:8px;">
          <pre class="json-view" style="color:#94a3b8;">${timeStr}|[${escapeHtml(entry.scope)}]|${escapeHtml(entry.type)}|${escapeHtml(entry.title)}|${escapeHtml(entry.details || '')}</pre>
        </div>
      </details>
    `;
  }


  // ══════════════════════════════════════════════════════════════════════
  // AUTOMATIC REAL SOURCE CODE FETCHER (Salesforce Tooling API)
  // ══════════════════════════════════════════════════════════════════════
  function getCandidateNames(tag) {
    if (!tag) return [];
    let clean = tag.replace(/^<|>$/g, '');
    if (clean.startsWith('c-')) clean = clean.substring(2);
    const candidates = new Set();
    candidates.add(clean);
    // kebab to camelCase: cma_summarize-coverages -> cma_summarizeCoverages
    const camel = clean.replace(/-([a-z0-9])/g, (g) => g[1].toUpperCase());
    candidates.add(camel);
    // clean underscores
    candidates.add(clean.replace(/_/g, ''));
    candidates.add(camel.replace(/_/g, ''));
    // PascalCase
    candidates.add(camel.charAt(0).toUpperCase() + camel.slice(1));
    return Array.from(candidates);
  }

  const fetchingPending = new Set();

  async function autoFetchSingleComponentSource(compName) {
    if (!compName) return;
    const clean = normalizeCompKey(compName);
    if (fetchingPending.has(clean) || getRealSourceFile(compName)) return;
    fetchingPending.add(clean);

    if (DBG.baseUrl && DBG.sessionId) {
      try {
        const candidates = getCandidateNames(compName);
        const whereClauses = candidates.map(c => `LightningComponentBundle.DeveloperName = '${c}'`).join(' OR ');
        const q = encodeURIComponent(`SELECT Id, LightningComponentBundle.DeveloperName, FilePath, Format, Source FROM LightningComponentResource WHERE Format = 'js' AND (${whereClauses})`);
        const endpoint = `${DBG.baseUrl}/services/data/v58.0/tooling/query/?q=${q}`;

        const res = await fetch(endpoint, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${DBG.sessionId}`,
            'Content-Type': 'application/json'
          }
        });

        if (res.ok) {
          const data = await res.json();
          if (data && data.records && data.records.length > 0) {
            const primary = data.records.find(r => r.FilePath && !r.FilePath.includes('test')) || data.records[0];
            if (primary && primary.Source) {
              const bName = primary.LightningComponentBundle?.DeveloperName;
              saveRealSourceFile(compName, primary.Source);
              if (bName) {
                saveRealSourceFile(bName, primary.Source);
              }
              console.log(`[SF Debugger] Auto-fetched real source for ${compName} directly from Salesforce!`);
              return;
            }
          }
        }
      } catch (err) {}
    }

    // Secondary fallback: Try fetching from Salesforce web server module endpoint
    try {
      const candidates = getCandidateNames(compName);
      for (let c of candidates) {
        const urls = [
          `/c/${c}.js`,
          `/s/sfsites/c/${c}.js`,
          `/webruntime/component/c/${c}`
        ];
        for (let u of urls) {
          try {
            const resp = await fetch(u);
            if (resp.ok) {
              const text = await resp.text();
              if (text && text.length > 50 && (text.includes('class') || text.includes('export default'))) {
                saveRealSourceFile(compName, text);
                saveRealSourceFile(c, text);
                return;
              }
            }
          } catch (e) {}
        }
      }
    } catch (e) {}
  }

  async function autoFetchAllOrgLwcSource() {
    if (!DBG.baseUrl || !DBG.sessionId) return;
    try {
      const statusPill = document.getElementById('footerStatus');
      if (statusPill) statusPill.textContent = 'Auto-fetching all real LWC files from Salesforce...';

      const q = encodeURIComponent("SELECT Id, LightningComponentBundle.DeveloperName, FilePath, Format, Source FROM LightningComponentResource WHERE Format = 'js' AND (NOT FilePath LIKE '%/test/%') AND (NOT FilePath LIKE '%.test.js') LIMIT 200");
      const endpoint = `${DBG.baseUrl}/services/data/v58.0/tooling/query/?q=${q}`;

      const res = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${DBG.sessionId}`,
          'Content-Type': 'application/json'
        }
      });

      if (res.ok) {
        const data = await res.json();
        if (data && data.records && data.records.length > 0) {
          let count = 0;
          data.records.forEach(rec => {
            const bundleName = rec.LightningComponentBundle?.DeveloperName;
            const sourceCode = rec.Source;
            if (bundleName && sourceCode) {
              saveRealSourceFile(bundleName, sourceCode);
              const kebab = bundleName.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
              saveRealSourceFile(kebab, sourceCode);
              saveRealSourceFile('c-' + kebab, sourceCode);
              count++;
            }
          });
          console.log(`[SF Debugger] Successfully auto-mapped ${count} real LWC source files from Salesforce!`);
          if (statusPill) statusPill.textContent = `✅ Auto-mapped ${count} real LWC components from Org`;
        }
      }
    } catch (err) {
      console.warn('[SF Debugger] autoFetchAllOrgLwcSource error:', err);
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // 3. EXTENSION INJECTION & COMMUNICATION BRIDGE
  // ══════════════════════════════════════════════════════════════════════
  function setupInjectionBridge() {
    if (typeof chrome !== 'undefined' && chrome.scripting && DBG.targetTabId) {
      injectIntoTargetTab(DBG.targetTabId);

      if (chrome.tabs && chrome.tabs.onUpdated) {
        chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
          if (tabId === DBG.targetTabId && changeInfo.status === 'complete') {
            document.getElementById('footerStatus').textContent = 'Salesforce page reloaded. Re-attaching probe...';
            setTimeout(() => injectIntoTargetTab(DBG.targetTabId), 1000);
          }
        });
      }
    } else {
      const script = document.createElement('script');
      script.textContent = `(${pageMainWorldProbe.toString()})();`;
      (document.head || document.documentElement).appendChild(script);
    }

    window.addEventListener('__SF_DEBUG_DISPATCH__', (e) => {
      if (e.detail && e.detail.source === 'SF_DEBUGGER_PROBE') {
        processIncomingProbeData(e.detail.type, e.detail.payload);
      }
    });

    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message && message.source === 'SF_DEBUGGER_PROBE') {
          processIncomingProbeData(message.type, message.payload);
          if (sendResponse) sendResponse({ received: true });
        }
        return true;
      });
    }
  }

  function injectIntoTargetTab(tabId) {
    if (!chrome.scripting) return;

    chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      world: 'MAIN',
      func: pageMainWorldProbe
    }).catch(err => {
      console.warn('Probe main world injection note:', err);
    });

    chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      world: 'ISOLATED',
      func: function () {
        if (window.__SF_RELAY_ACTIVE__) return;
        window.__SF_RELAY_ACTIVE__ = true;
        window.addEventListener('__SF_DEBUG_DISPATCH__', (ev) => {
          if (ev.detail && chrome.runtime && chrome.runtime.id) {
            try {
              chrome.runtime.sendMessage(ev.detail, () => {
                if (chrome.runtime.lastError) {
                  // Consume error to suppress 'Unchecked runtime.lastError'
                }
              });
            } catch (e) {}
          }
        });
      }
    }).catch(err => {
      console.warn('Relay injection note:', err);
    });

    document.getElementById('footerStatus').textContent = `Connected to Salesforce Tab #${tabId}`;
  }

  function requestComponentScan() {
    if (typeof chrome !== 'undefined' && chrome.scripting && DBG.targetTabId) {
      chrome.scripting.executeScript({
        target: { tabId: DBG.targetTabId },
        world: 'MAIN',
        func: function () {
          if (window.__SF_SCAN_DOM_COMPONENTS__) {
            return window.__SF_SCAN_DOM_COMPONENTS__();
          }
        }
      }).then(res => {
        if (res && res[0] && res[0].result) {
          processIncomingProbeData('COMPONENT_TREE_RESULT', res[0].result);
        }
      }).catch(() => {});
    } else {
      if (window.__SF_SCAN_DOM_COMPONENTS__) {
        window.__SF_SCAN_DOM_COMPONENTS__();
      }
    }
  }

  function evaluateWatchExpressionOnPage(id, expr) {
    if (typeof chrome !== 'undefined' && chrome.scripting && DBG.targetTabId) {
      chrome.scripting.executeScript({
        target: { tabId: DBG.targetTabId },
        world: 'MAIN',
        args: [id, expr],
        func: function (wid, wexpr) {
          try {
            const result = eval(wexpr);
            window.dispatchEvent(new CustomEvent('__SF_DEBUG_DISPATCH__', {
              detail: {
                source: 'SF_DEBUGGER_PROBE',
                type: 'WATCH_EXPR_RESULT',
                payload: { id: wid, expr: wexpr, value: result }
              }
            }));
          } catch (e) {
            window.dispatchEvent(new CustomEvent('__SF_DEBUG_DISPATCH__', {
              detail: {
                source: 'SF_DEBUGGER_PROBE',
                type: 'WATCH_EXPR_RESULT',
                payload: { id: wid, expr: wexpr, error: e.message }
              }
            }));
          }
        }
      }).catch(() => {});
    } else {
      window.dispatchEvent(new CustomEvent('__SF_EVAL_EXPR_REQ__', {
        detail: { id, expr }
      }));
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // 4. SMART SALESFORCE PAYLOAD & RESPONSE DECODERS
  // ══════════════════════════════════════════════════════════════════════

  /**
   * Decodes URL-encoded Visualforce form postbacks, separating readable field inputs
   * from massive encrypted ViewState binary tokens.
   */
  function decodeSalesforcePayload(raw) {
    if (!raw) return { isEmpty: true };
    if (typeof raw === 'object') return { isObject: true, data: raw };
    if (typeof raw !== 'string') return { isPrimitive: true, data: raw };

    // Check if it's a URL-encoded Visualforce / Form POST string
    if (raw.includes('=') && (raw.includes('&') || raw.startsWith('AJAXREQUEST') || raw.includes('com.salesforce.visualforce') || raw.includes('pg%3A'))) {
      try {
        const params = new URLSearchParams(raw);
        const userInputs = [];
        const internalState = {};
        let triggeredAction = null;

        for (const [key, value] of params.entries()) {
          const cleanKey = decodeURIComponent(key);
          const cleanVal = decodeURIComponent(value);

          if (cleanKey.startsWith('com.salesforce.visualforce.')) {
            const subKey = cleanKey.replace('com.salesforce.visualforce.', '');
            if (subKey === 'ViewState') {
              internalState['ViewStateSize'] = (cleanVal.length / 1024).toFixed(2) + ' KB (Encrypted Binary)';
              internalState['ViewStatePreview'] = cleanVal.substring(0, 60) + '...';
            } else {
              internalState[subKey] = cleanVal;
            }
          } else if (cleanKey === 'AJAXREQUEST') {
            internalState['AJAXREQUEST'] = cleanVal;
          } else if (cleanVal === cleanKey && cleanKey.includes(':')) {
            // Visualforce buttons submit their own ID as value (e.g. pg:j_id1:frm:j_id22)
            triggeredAction = cleanKey;
            userInputs.push({ key: cleanKey, value: cleanVal, isAction: true });
          } else {
            userInputs.push({ key: cleanKey, value: cleanVal, isAction: false });
          }
        }

        return {
          isVFPostBack: true,
          triggeredAction,
          userInputs,
          internalState,
          rawString: raw
        };
      } catch (e) {}
    }

    // Check if Aura / LWC message string
    if (raw.startsWith('message=') || raw.includes('"actions":[')) {
      try {
        const jsonStr = raw.startsWith('message=') ? decodeURIComponent(raw.substring(8)) : raw;
        const parsed = JSON.parse(jsonStr);
        if (parsed.actions && Array.isArray(parsed.actions)) {
          return {
            isAuraAction: true,
            actions: parsed.actions.map(a => ({
              method: a.descriptor || a.id,
              params: a.params
            })),
            rawString: raw
          };
        }
        return { isObject: true, data: parsed, rawString: raw };
      } catch (e) {}
    }

    // Try standard JSON
    try {
      const parsedJson = JSON.parse(raw);
      return { isObject: true, data: parsedJson, rawString: raw };
    } catch (e) {}

    return { isPlainText: true, data: raw };
  }

  /**
   * Decodes Visualforce XML responses, partial-response DOM diffs,
   * Apex errors, or JSON return values.
   */
  function decodeSalesforceResponse(raw) {
    if (raw === undefined || raw === null) return { isEmpty: true };
    if (typeof raw === 'object') {
      if (raw.actions && Array.isArray(raw.actions)) {
        return {
          isAuraResponse: true,
          actions: raw.actions.map(a => ({
            id: a.id,
            state: a.state,
            returnValue: a.returnValue,
            error: a.error
          }))
        };
      }
      return { isObject: true, data: raw };
    }
    if (typeof raw !== 'string') return { isPrimitive: true, data: raw };

    // Check for Visualforce XML Partial Response
    if (raw.includes('<partial-response') || raw.includes('<update id=')) {
      try {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(raw, 'text/xml');
        const updates = xmlDoc.querySelectorAll('update');
        const updateList = [];
        let newViewStateSize = null;

        updates.forEach(up => {
          const id = up.getAttribute('id') || 'section';
          const content = up.textContent.trim();
          if (id.includes('ViewState')) {
            newViewStateSize = (content.length / 1024).toFixed(2) + ' KB';
          } else {
            // Strip HTML tags for clean text preview
            const cleanText = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
            updateList.push({
              id,
              preview: cleanText.substring(0, 400) + (cleanText.length > 400 ? '...' : ''),
              contentLength: content.length,
              html: content
            });
          }
        });

        return {
          isVFXml: true,
          totalUpdates: updateList.length,
          newViewStateSize,
          updates: updateList,
          rawString: raw
        };
      } catch (e) {}
    }

    // Check for Visualforce HTML Page / Error Messages
    if (raw.includes('<html') || raw.includes('<!DOCTYPE') || raw.includes('class="message')) {
      const errMatch = raw.match(/<div class="message errorM3"[^>]*>([\s\S]*?)<\/div>/i);
      const cleanSummary = raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      return {
        isHtml: true,
        hasError: !!errMatch,
        errorMessage: errMatch ? errMatch[1].replace(/<[^>]+>/g, ' ').trim() : null,
        preview: cleanSummary.substring(0, 400) + (cleanSummary.length > 400 ? '...' : ''),
        rawString: raw
      };
    }

    // Try JSON
    try {
      const parsedJson = JSON.parse(raw);
      return { isObject: true, data: parsedJson, rawString: raw };
    } catch (e) {}

    return { isPlainText: true, data: raw };
  }

  // ══════════════════════════════════════════════════════════════════════
  // 5. INCOMING DATA HANDLERS & UI RENDERING
  // ══════════════════════════════════════════════════════════════════════
  function processIncomingProbeData(type, payload) {
    if (!DBG.isRecording && type !== 'COMPONENT_TREE_RESULT' && type !== 'WATCH_EXPR_RESULT') {
      return;
    }

    switch (type) {
      case 'APEX_LOG_EVENT':
        onApexLogEvent(payload);
        break;
      case 'APEX_CALL_START':
        onApexStart(payload);
        break;
      case 'APEX_CALL_END':
        onApexEnd(payload);
        break;
      case 'FLOW_STATEMENT':
        if (payload.component && !getRealSourceFile(payload.component)) {
          autoFetchSingleComponentSource(payload.component);
        }
        onFlowStatement(payload);
        break;
      case 'VARIABLE_SNAPSHOT':
        onVariableSnapshot(payload);
        break;
      case 'EVENT_FIRED':
      case 'ACTION_CLICKED':
        onEventCaptured(type, payload);
        break;
      case 'VF_REMOTING_START':
      case 'VF_REMOTING_END':
        onVfRemoting(type, payload);
        break;
      case 'COMPONENT_TREE_RESULT':
        onComponentTreeResult(payload);
        break;
      case 'WATCH_EXPR_RESULT':
        onWatchResult(payload);
        break;
    }
  }

  // ── APEX / SERVER CALL HANDLERS ──
  function onApexStart(call) {
    // Pre-decode payload so list row has meaningful labels
    call.decodedParams = decodeSalesforcePayload(call.rawBody || call.params);
    DBG.apexCalls.unshift(call);
    DBG.counters.apex++;
    updateBadge('apex', DBG.counters.apex);
    renderApexItem(call);
  }

  function onApexEnd(data) {
    const call = DBG.apexCalls.find(c => c.id === data.id);
    if (call) {
      Object.assign(call, data);
      call.decodedResponse = decodeSalesforceResponse(data.rawResponseText || data.response);

      const row = document.getElementById('apex-row-' + data.id);
      if (row) {
        const pill = row.querySelector('.status-pill');
        if (pill) {
          const isSuccess = data.status >= 200 && data.status < 300;
          pill.className = `status-pill ${isSuccess ? 'status-success' : 'status-error'}`;
          pill.textContent = data.status ? String(data.status) : 'ERR';
        }
        const dur = row.querySelector('.duration-tag');
        if (dur) dur.textContent = (data.duration || 0) + 'ms';
      }
      if (DBG.selectedApexId === data.id) {
        showApexDetail(call);
      }
    }
  }

  function renderApexItem(call) {
    const list = document.getElementById('apexList');
    const empty = list.querySelector('.empty-hint');
    if (empty) empty.remove();

    const row = document.createElement('div');
    row.id = 'apex-row-' + call.id;
    row.className = 'log-row';

    // Build smart label
    let title = call.method;
    let subtitle = '';

    if (call.decodedParams && call.decodedParams.isVFPostBack) {
      const inputs = call.decodedParams.userInputs || [];
      const valPreviews = inputs.filter(i => !i.isAction && i.value).map(i => i.value).slice(0, 3).join(', ');
      subtitle = (call.decodedParams.triggeredAction ? `⚡ ${call.decodedParams.triggeredAction.split(':').pop()}` : '') + 
                 (valPreviews ? ` | ${valPreviews}` : '');
    }

    row.innerHTML = `
      <div style="flex:1; overflow:hidden;">
        <div class="row-primary">
          <span class="status-pill status-pending">CALL</span>
          <span style="font-weight:600; color:var(--text-main); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(title)}</span>
        </div>
        ${subtitle ? `<div style="font-size:11px; color:var(--accent-amber); margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(subtitle)}</div>` : ''}
      </div>
      <div style="text-align:right; margin-left:8px;">
        <span class="duration-tag">...</span>
        <div class="time-tag" style="margin-top:2px;">${new Date(call.startTime).toLocaleTimeString()}</div>
      </div>
    `;

    row.onclick = () => {
      document.querySelectorAll('#apexList .log-row').forEach(r => r.classList.remove('selected'));
      row.classList.add('selected');
      DBG.selectedApexId = call.id;
      showApexDetail(call);
    };

    list.insertBefore(row, list.firstChild);
    if (document.getElementById('chkAutoScroll').checked) list.scrollTop = 0;
  }

  function showApexDetail(call) {
    const detail = document.getElementById('apexDetail');
    const viewMode = DBG.viewModes.get(call.id) || 'clean';

    let paramsHtml = '';
    let responseHtml = '';

    const decodedP = call.decodedParams || decodeSalesforcePayload(call.rawBody || call.params);
    const decodedR = call.decodedResponse || decodeSalesforceResponse(call.rawResponseText || call.response);

    // ── RENDER PARAMETERS ──
    if (viewMode === 'raw') {
      paramsHtml = `<pre class="json-view">${escapeHtml(String(call.rawBody || JSON.stringify(call.params, null, 2)))}</pre>`;
    } else if (decodedP.isVFPostBack) {
      const inputs = decodedP.userInputs || [];
      const stateKeys = Object.keys(decodedP.internalState || {});

      paramsHtml = `
        <div style="margin-bottom:8px;">
          <span style="font-size:11px; color:var(--text-muted);">
            Decoded Form Data (${inputs.length} user parameters):
          </span>
        </div>
        <table class="vf-param-table">
          <thead>
            <tr>
              <th style="width: 45%;">Field / Component ID</th>
              <th>Submitted Value</th>
            </tr>
          </thead>
          <tbody>
            ${inputs.map(item => `
              <tr>
                <td class="field-key">${escapeHtml(item.key)}</td>
                <td>
                  ${item.isAction 
                    ? `<span class="field-action-tag">⚡ Triggered Action (${escapeHtml(item.key.split(':').pop())})</span>` 
                    : `<span class="field-val-highlight">"${escapeHtml(item.value)}"</span>`}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <details class="vf-collapsible">
          <summary>📦 Salesforce ViewState & Internal Tokens (${stateKeys.length} items — Collapsed)</summary>
          <div style="padding-top:8px;">
            <table class="vf-param-table">
              ${stateKeys.map(k => `
                <tr>
                  <td style="color:var(--text-muted); width:35%;">${escapeHtml(k)}</td>
                  <td style="color:#fff;">${escapeHtml(decodedP.internalState[k])}</td>
                </tr>
              `).join('')}
            </table>
          </div>
        </details>
      `;
    } else if (decodedP.isAuraAction) {
      paramsHtml = `
        <div style="margin-bottom:6px; color:var(--accent-purple); font-weight:bold;">
          Aura / LWC Apex Actions (${decodedP.actions.length}):
        </div>
        ${decodedP.actions.map(act => `
          <div class="response-card">
            <div class="response-card-header">${escapeHtml(act.method)}</div>
            <pre class="json-view">${highlightJson(act.params)}</pre>
          </div>
        `).join('')}
      `;
    } else {
      paramsHtml = `<pre class="json-view">${highlightJson(decodedP.data || call.params)}</pre>`;
    }

    // ── RENDER RESPONSE ──
    if (viewMode === 'raw') {
      responseHtml = `<pre class="json-view">${escapeHtml(String(call.rawResponseText || JSON.stringify(call.response, null, 2)))}</pre>`;
    } else if (decodedR.isVFXml) {
      responseHtml = `
        <div style="margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
          <span style="color:var(--accent-green); font-weight:bold;">
            Visualforce Partial DOM Updates (${decodedR.totalUpdates} components updated)
          </span>
          ${decodedR.newViewStateSize ? `<span style="font-size:10px; color:var(--text-muted);">New ViewState: ${escapeHtml(decodedR.newViewStateSize)}</span>` : ''}
        </div>
        ${decodedR.updates.map(up => `
          <div class="response-card">
            <div class="response-card-header">Updated Component: <code>&lt;... id="${escapeHtml(up.id)}"&gt;</code></div>
            <div style="color:var(--text-main); font-size:12px; margin-top:4px;">
              ${up.preview ? escapeHtml(up.preview) : '<em style="color:var(--text-muted);">Empty content</em>'}
            </div>
          </div>
        `).join('')}
      `;
    } else if (decodedR.isHtml) {
      responseHtml = `
        ${decodedR.hasError ? `
          <div style="background:#451a1a; border:1px solid var(--accent-red); color:#fca5a5; padding:8px 12px; border-radius:6px; margin-bottom:8px;">
            <strong>⛔ Visualforce Page Error:</strong><br>${escapeHtml(decodedR.errorMessage)}
          </div>
        ` : ''}
        <div class="response-card">
          <div class="response-card-header">Rendered Page Content:</div>
          <div style="color:var(--text-main); font-size:12px;">${escapeHtml(decodedR.preview)}</div>
        </div>
      `;
    } else if (decodedR.isAuraResponse) {
      responseHtml = `
        ${decodedR.actions.map(act => `
          <div class="response-card">
            <div class="response-card-header" style="color:${act.state === 'SUCCESS' ? 'var(--accent-green)' : 'var(--accent-red)'};">
              Action Status: ${escapeHtml(act.state)}
            </div>
            ${act.error ? `<div style="color:var(--accent-red); margin-bottom:6px;">${escapeHtml(JSON.stringify(act.error))}</div>` : ''}
            <h4 style="color:var(--accent-blue); margin:4px 0;">Return Value:</h4>
            <pre class="json-view">${highlightJson(act.returnValue)}</pre>
          </div>
        `).join('')}
      `;
    } else {
      responseHtml = `<pre class="json-view">${highlightJson(call.response !== undefined ? (decodedR.data || call.response) : (call.error || 'Waiting for response...'))}</pre>`;
    }

    detail.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">
        <div>
          <h3 style="color:var(--accent-blue); margin-bottom:4px;">${escapeHtml(call.method)}</h3>
          <p style="color:var(--text-muted); font-size:11px;">Endpoint: ${escapeHtml(call.url)}</p>
        </div>
        <div style="display:flex; gap:6px;">
          <button id="btnToggleClean" class="btn-toggle-view ${viewMode === 'clean' ? 'active' : ''}">Decoded View</button>
          <button id="btnToggleRaw" class="btn-toggle-view ${viewMode === 'raw' ? 'active' : ''}">Raw String</button>
        </div>
      </div>
      
      <!-- Parameters Section -->
      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px;">
        <h4 style="color:var(--accent-amber);">📤 Parameters Passed to Server:</h4>
        <button id="btnCopyParams" class="btn btn-sm">📋 Copy</button>
      </div>
      ${paramsHtml}

      <!-- Response Section -->
      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:16px;">
        <h4 style="color:var(--accent-green);">📥 Response Received:</h4>
        <button id="btnCopyResponse" class="btn btn-sm">📋 Copy</button>
      </div>
      ${responseHtml}

      <!-- Trigger Location -->
      <h4 style="color:var(--accent-purple); margin:16px 0 6px;">📍 Triggered From (File & Line Number):</h4>
      <p style="font-size:12px; color:var(--text-muted); background:var(--bg-card); padding:8px 12px; border-radius:6px; border:1px solid var(--border-color);">
        <span style="color:var(--accent-amber); font-weight:bold;">Line ${call.trace?.line || '?'}:${call.trace?.column || 0}</span> in 
        <span style="color:var(--accent-blue); font-weight:bold;">${escapeHtml(call.trace?.file || 'inline script')}</span> 
        (Method: <code>${escapeHtml(call.trace?.method || 'anonymous')}</code>)
      </p>
    `;

    // Wire up copy buttons and view toggles
    document.getElementById('btnToggleClean').onclick = () => {
      DBG.viewModes.set(call.id, 'clean');
      showApexDetail(call);
    };
    document.getElementById('btnToggleRaw').onclick = () => {
      DBG.viewModes.set(call.id, 'raw');
      showApexDetail(call);
    };
    document.getElementById('btnCopyParams').onclick = () => {
      const copyVal = call.rawBody || JSON.stringify(call.params, null, 2);
      navigator.clipboard.writeText(String(copyVal));
    };
    document.getElementById('btnCopyResponse').onclick = () => {
      const copyVal = call.rawResponseText || JSON.stringify(call.response || call.error || '', null, 2);
      navigator.clipboard.writeText(String(copyVal));
    };
  }

  // ── FLOW & STATEMENT HANDLERS (Code Lines & Variable Inspector) ──
  function onFlowStatement(step) {
    step.id = step.id || ('flow_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 5));
    DBG.flowLogs.unshift(step);
    DBG.counters.flow++;
    updateBadge('flow', DBG.counters.flow);

    renderFlowItem(step);
  }

  function renderFlowItem(step) {
    const list = document.getElementById('flowList');
    if (!list) return;
    const empty = list.querySelector('.empty-hint');
    if (empty) empty.remove();

    const row = document.createElement('div');
    row.id = 'flow-row-' + step.id;
    row.className = 'log-row';

    const numChanged = step.changedVariables ? step.changedVariables.length : 0;
    const changedPill = numChanged > 0 
      ? `<span style="font-size:10px; color:var(--accent-green); background:rgba(52,211,153,0.12); padding:1px 5px; border-radius:3px;">⚡ ${numChanged} var${numChanged > 1 ? 's' : ''} changed</span>`
      : `<span style="font-size:10px; color:var(--text-muted);">No state change</span>`;

    row.innerHTML = `
      <div style="flex:1; overflow:hidden;">
        <div class="row-primary">
          <span class="status-pill status-success">EXEC</span>
          <span style="font-weight:600; color:var(--accent-purple);">&lt;${escapeHtml(step.component)}&gt;</span>
          <span style="font-weight:bold; color:#fff;">.${escapeHtml(step.method)}()</span>
        </div>
        <div style="display:flex; gap:6px; align-items:center; margin-top:2px;">
          <span class="line-badge">Line ${step.trace?.line || '?'}</span>
          <span class="file-path">${escapeHtml(step.trace?.file || '')}</span>
          ${changedPill}
        </div>
      </div>
      <div style="text-align:right; margin-left:8px;">
        <span class="time-tag">${new Date(step.timestamp).toLocaleTimeString()}</span>
      </div>
    `;

    row.onclick = () => {
      document.querySelectorAll('#flowList .log-row').forEach(r => r.classList.remove('selected'));
      row.classList.add('selected');
      showFlowDetail(step);
    };

    list.insertBefore(row, list.firstChild);
    if (document.getElementById('chkAutoScroll').checked) list.scrollTop = 0;
  }

  function showFlowDetail(step) {
    const detail = document.getElementById('flowDetail');
    if (!detail) return;

    const changed = step.changedVariables || [];
    const compName = step.component || '';
    const methodName = step.method || '';

    // Check if real source file is mapped for this component!
    const realSource = getRealSourceFile(compName);
    const realMethodData = realSource ? parseRealMethodLines(realSource, methodName) : null;

    let codeTableHtml = '';
    let fileName = compName + '.js';

    if (realMethodData) {
      fileName = compName + '.js (Real Source Mapped)';
      codeTableHtml = `
        <div class="code-editor-box">
          <div class="code-editor-header">
            <span>📄 <strong>${escapeHtml(compName)}.js</strong> (Method: <code>${escapeHtml(methodName)}</code>)</span>
            <span class="real-source-mapped-badge">⚡ Real File Lines ${realMethodData.startLine} – ${realMethodData.endLine}</span>
          </div>
          <table class="code-line-table">
            <tbody>
              ${realMethodData.lines.map(item => {
                const varsInLine = extractVariablesFromCodeLine(item.code, step);
                const isExecuted = varsInLine.some(v => v.isChanged) || item.code.includes('this.') || item.code.includes(methodName);
                const bgStyle = varsInLine.some(v => v.isChanged) 
                  ? 'background:rgba(52,211,153,0.14); border-left:3px solid var(--accent-green);' 
                  : (isExecuted ? 'background:rgba(56,189,248,0.06);' : '');

                return `
                  <tr style="${bgStyle}">
                    <td class="code-num-col" style="color:var(--accent-blue); font-weight:bold;">${item.lineNum}</td>
                    <td class="code-text-col">
                      <div>${escapeHtml(item.code)}</div>
                      ${varsInLine.length > 0 ? `
                        <div style="margin-top:3px; display:flex; flex-wrap:wrap; gap:4px;">
                          ${varsInLine.map(v => `
                            <span class="inline-var-pill ${v.isChanged ? 'pill-diff' : ''}">
                              <span class="var-name">${escapeHtml(v.name)}:</span>
                              ${v.isChanged ? `<span style="color:var(--accent-red); text-decoration:line-through; font-size:10px;">${escapeHtml(JSON.stringify(v.oldValue))}</span> ➔` : ''}
                              <span class="var-val">${escapeHtml(JSON.stringify(v.value))}</span>
                            </span>
                          `).join('')}
                        </div>
                      ` : ''}
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      `;
    } else {
      const source = step.sourceCode || '';
      const startLine = step.trace?.line || 1;
      const lines = source ? source.split('\n') : [];
      if (lines.length > 0) {
        codeTableHtml = `
          <div class="code-editor-box">
            <div class="code-editor-header">
              <span>📄 ${escapeHtml(step.trace?.file || (step.component + '.js'))} (Method: <code>${escapeHtml(step.method)}</code>)</span>
              <span>Lines ${startLine} – ${startLine + lines.length - 1}</span>
            </div>
            <table class="code-line-table">
              <tbody>
                ${lines.map((line, idx) => {
                  const lineNum = startLine + idx;
                  const isHighlighted = changed.some(c => line.includes(c.variable));
                  const bgStyle = isHighlighted ? 'background:rgba(52,211,153,0.12);' : '';
                  return `
                    <tr style="${bgStyle}">
                      <td class="code-num-col">${lineNum}</td>
                      <td class="code-text-col">${escapeHtml(line)}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        `;
      }
    }

    detail.innerHTML = `
      <div style="margin-bottom:12px;">
        <h3 style="color:var(--accent-purple); margin-bottom:4px;">
          &lt;${escapeHtml(step.component)}&gt; <span style="color:#fff;">.${escapeHtml(step.method)}()</span>
        </h3>
        <p style="color:var(--text-muted); font-size:11px;">
          File: <strong>${escapeHtml(step.trace?.file || 'component.js')}</strong> | Starting at Line ${startLine}
        </p>
      </div>

      <!-- 1. Changed Variables Box (Live values of executed line variables) -->
      <div style="margin-bottom:12px;">
        <h4 style="color:var(--accent-green); margin-bottom:6px;">
          ⚡ Variables Changed in this Line / Method Execution (${changed.length}):
        </h4>
        ${changed.length > 0 ? `
          <div class="var-diff-box">
            ${changed.map(c => `
              <div class="var-diff-item">
                <span class="var-name-tag">this.${escapeHtml(c.variable)}:</span>
                <span class="var-old-val">${escapeHtml(JSON.stringify(c.oldValue))}</span>
                <span class="var-arrow">➔</span>
                <span class="var-new-val">${escapeHtml(JSON.stringify(c.newValue))}</span>
              </div>
            `).join('')}
          </div>
        ` : `
          <div style="font-size:12px; color:var(--text-muted); background:var(--bg-card); padding:8px 12px; border-radius:6px; border:1px solid var(--border-color);">
            No component state variables were modified during this execution.
          </div>
        `}
      </div>

      <!-- 2. Source Code of the Executed Function with Line Numbers -->
      <div style="margin-bottom:12px;">
        <h4 style="color:var(--accent-blue); margin-bottom:6px;">
          📜 Executed JavaScript Code Lines:
        </h4>
        ${codeTableHtml || `<pre class="json-view">${escapeHtml(source || 'Source unavailable')}</pre>`}
      </div>

      <!-- 3. Arguments Passed to Function -->
      <div style="margin-bottom:12px;">
        <h4 style="color:var(--accent-amber); margin-bottom:6px;">
          📥 Function Arguments (Input Values):
        </h4>
        <pre class="json-view">${highlightJson(step.args && step.args.length === 1 ? step.args[0] : (step.args || []))}</pre>
      </div>

      <!-- 4. All Component Variables on 'this' -->
      <div style="margin-bottom:12px;">
        <details class="vf-collapsible" open>
          <summary>👁 All Component Variables (Full 'this' Scope State)</summary>
          <div style="padding-top:8px;">
            <pre class="json-view">${highlightJson(step.afterVariables || step.scopeVariables || {})}</pre>
          </div>
        </details>
      </div>
    `;
  }

  // ── VARIABLE WATCHERS & SNAPSHOTS ──
  function onVariableSnapshot(data) {
    DBG.autoVariables.set(data.component, data.properties);
    DBG.counters.vars = DBG.autoVariables.size + DBG.watchedExpressions.length;
    updateBadge('vars', DBG.counters.vars);

    const list = document.getElementById('autoVarsList');
    const empty = list.querySelector('.empty-hint');
    if (empty) empty.remove();

    let card = document.getElementById('var-card-' + data.component);
    if (!card) {
      card = document.createElement('div');
      card.id = 'var-card-' + data.component;
      card.className = 'watch-card';
      list.prepend(card);
    }

    card.innerHTML = `
      <div class="watch-card-header">
        <span>&lt;${escapeHtml(data.component)}&gt; Reactive State</span>
        <span style="font-size:10px; color:var(--text-muted);">Triggered by .${escapeHtml(data.triggerMethod || '')}()</span>
      </div>
      <pre class="json-view">${highlightJson(data.properties)}</pre>
    `;
  }

  function addCustomWatch(expr) {
    if (!expr) return;
    const id = 'watch_' + Math.random().toString(36).substr(2, 6);
    DBG.watchedExpressions.push({ id, expr });
    evaluateWatchExpressionOnPage(id, expr);
  }

  function onWatchResult(res) {
    const list = document.getElementById('watchedItemsList');
    const empty = list.querySelector('.empty-hint');
    if (empty) empty.remove();

    let item = document.getElementById('custom-watch-' + res.id);
    if (!item) {
      item = document.createElement('div');
      item.id = 'custom-watch-' + res.id;
      item.className = 'watch-card';
      list.appendChild(item);
    }

    item.innerHTML = `
      <div class="watch-card-header">
        <span>${escapeHtml(res.expr)}</span>
        <span style="font-size:10px; color:${res.error ? 'var(--accent-red)' : 'var(--accent-green)'}">
          ${res.error ? 'ERROR' : 'LIVE'}
        </span>
      </div>
      <pre class="json-view">${highlightJson(res.error || res.value)}</pre>
    `;
  }

  // ── EVENT CAPTURE (Buttons & CustomEvents) ──
  function onEventCaptured(type, data) {
    if (!data || !data.type || data.type.startsWith('__SF_') || data.type.includes('DEBUG')) {
      return;
    }
    DBG.events.unshift(data);
    DBG.counters.events++;
    updateBadge('events', DBG.counters.events);

    const list = document.getElementById('eventsList');
    const empty = list.querySelector('.empty-hint');
    if (empty) empty.remove();

    const row = document.createElement('div');
    row.className = 'log-row';

    const isActionClick = type === 'ACTION_CLICKED';
    const titleText = isActionClick ? `Click: "${data.label || data.tag}"` : `Event: ${data.type}`;
    const badgeColor = isActionClick ? 'status-pending' : 'status-success';

    row.innerHTML = `
      <div class="row-primary">
        <span class="status-pill ${badgeColor}">${isActionClick ? 'CLICK' : 'EVENT'}</span>
        <span style="font-weight:600; color:${isActionClick ? 'var(--accent-amber)' : 'var(--accent-purple)'};">${escapeHtml(titleText)}</span>
        <span style="font-size:11px; color:var(--text-muted);">&lt;${escapeHtml(data.targetTag || data.tag)}&gt;</span>
      </div>
      <span class="time-tag">${new Date(data.timestamp).toLocaleTimeString()}</span>
    `;

    row.onclick = () => {
      document.querySelectorAll('#eventsList .log-row').forEach(r => r.classList.remove('selected'));
      row.classList.add('selected');
      const detail = document.getElementById('eventDetail');

      detail.innerHTML = `
        <h3 style="color:${isActionClick ? 'var(--accent-amber)' : 'var(--accent-purple)'}; margin-bottom:8px;">${escapeHtml(titleText)}</h3>
        <p style="color:var(--text-muted); margin-bottom:8px;">Target Element: <code>&lt;${escapeHtml(data.targetTag || data.tag)}&gt;</code></p>
        
        <h4 style="color:var(--accent-blue); margin:8px 0 4px;">Payload / Event Detail:</h4>
        <pre class="json-view">${highlightJson(data.detail || data.dataset || {})}</pre>

        <h4 style="color:var(--accent-green); margin:12px 0 4px;">Trigger Origin (File & Line):</h4>
        <p style="font-size:12px; color:var(--text-muted); background:var(--bg-card); padding:6px 10px; border-radius:4px;">
          Line ${data.trace?.line || '?'} in ${escapeHtml(data.trace?.file || 'DOM interaction')}
        </p>
      `;
    };

    list.insertBefore(row, list.firstChild);
    if (document.getElementById('chkAutoScroll').checked) list.scrollTop = 0;
  }

  // ── VISUALFORCE REMOTING ──
  function onVfRemoting(type, data) {
    if (type === 'VF_REMOTING_START') {
      DBG.vfCalls.unshift(data);
      DBG.counters.vf++;
      updateBadge('vf', DBG.counters.vf);

      const list = document.getElementById('vfList');
      const empty = list.querySelector('.empty-hint');
      if (empty) empty.remove();

      const row = document.createElement('div');
      row.id = 'vf-row-' + data.id;
      row.className = 'log-row';
      row.innerHTML = `
        <div class="row-primary">
          <span class="status-pill status-pending">VF REMOTING</span>
          <span style="font-weight:600; color:#fff;">${escapeHtml(data.action)}</span>
        </div>
        <span class="time-tag">${new Date(data.startTime).toLocaleTimeString()}</span>
      `;

      row.onclick = () => {
        document.querySelectorAll('#vfList .log-row').forEach(r => r.classList.remove('selected'));
        row.classList.add('selected');
        document.getElementById('vfDetail').innerHTML = `
          <h3 style="color:var(--accent-blue); margin-bottom:8px;">${escapeHtml(data.action)}</h3>
          <h4 style="color:var(--accent-amber); margin:8px 0 4px;">Arguments Passed:</h4>
          <pre class="json-view">${highlightJson(data.args)}</pre>
          <h4 style="color:var(--accent-green); margin:12px 0 4px;">Callback Return Value:</h4>
          <pre class="json-view">${highlightJson(data.response || 'Waiting for response...')}</pre>
        `;
      };

      list.insertBefore(row, list.firstChild);
    } else if (type === 'VF_REMOTING_END') {
      const call = DBG.vfCalls.find(c => c.id === data.id);
      if (call) {
        Object.assign(call, data);
        const row = document.getElementById('vf-row-' + data.id);
        if (row) {
          const pill = row.querySelector('.status-pill');
          if (pill) {
            pill.className = `status-pill ${data.status === 'SUCCESS' ? 'status-success' : 'status-error'}`;
            pill.textContent = data.status;
          }
        }
      }
    }
  }

  // ── COMPONENT TREE RESULT ──
  function onComponentTreeResult(components) {
    DBG.components = components || [];
    DBG.counters.components = DBG.components.length;
    updateBadge('components', DBG.counters.components);

    const treeCol = document.getElementById('componentTree');
    treeCol.innerHTML = '';

    if (!DBG.components.length) {
      treeCol.innerHTML = '<div class="empty-hint">No LWC components detected on active page.</div>';
      return;
    }

    DBG.components.forEach(comp => {
      const node = document.createElement('div');
      node.className = 'tree-node';
      node.style.paddingLeft = (comp.depth * 18 + 12) + 'px';
      node.innerHTML = `
        <span>${comp.depth > 0 ? '↳' : '•'}</span>
        <span class="tag-name">&lt;${escapeHtml(comp.tag)}&gt;</span>
        ${comp.parent ? `<span style="font-size:10px; color:var(--text-muted);">(inside &lt;${escapeHtml(comp.parent)}&gt;)</span>` : ''}
      `;

      node.onclick = () => {
        document.querySelectorAll('#componentTree .tree-node').forEach(n => n.classList.remove('selected'));
        node.classList.add('selected');
        const detail = document.getElementById('componentDetail');
        detail.innerHTML = `
          <h3 style="color:var(--accent-purple); margin-bottom:6px;">&lt;${escapeHtml(comp.tag)}&gt;</h3>
          <p style="color:var(--text-muted); margin-bottom:12px; font-size:11px;">
            Parent Component: <strong>${comp.parent ? `&lt;${escapeHtml(comp.parent)}&gt;` : 'Root'}</strong> | Nesting Depth: ${comp.depth}
          </p>
          
          <h4 style="color:var(--accent-amber); margin:8px 0 4px;">Attributes Passed from Parent:</h4>
          <pre class="json-view">${highlightJson(comp.attributes)}</pre>

          <h4 style="color:var(--accent-green); margin:12px 0 4px;">Exposed @api & Public Properties:</h4>
          <pre class="json-view">${highlightJson(comp.apiProperties)}</pre>
        `;
      };

      treeCol.appendChild(node);
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  // 6. JSON SYNTAX HIGHLIGHTING & FORMATTING
  // ══════════════════════════════════════════════════════════════════════
  function highlightJson(obj) {
    if (obj === undefined) return '<span class="json-null">undefined</span>';
    let str = typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2);
    try {
      str = JSON.stringify(JSON.parse(str), null, 2);
    } catch (e) {}

    return escapeHtml(str).replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, (match) => {
      let cls = 'json-num';
      if (/^"/.test(match)) {
        cls = /:$/.test(match) ? 'json-key' : 'json-string';
      } else if (/true|false/.test(match)) {
        cls = 'json-bool';
      } else if (/null/.test(match)) {
        cls = 'json-null';
      }
      return `<span class="${cls}">${match}</span>`;
    });
  }

  function escapeHtml(str) {
    if (typeof str !== 'string') str = String(str);
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function updateBadge(tab, count) {
    const el = document.getElementById('badge-' + tab);
    if (el) el.textContent = count > 999 ? '999+' : count;
    document.getElementById('footerCounters').textContent =
      `Apex: ${DBG.counters.apex} | Flow: ${DBG.counters.flow} | Components: ${DBG.counters.components} | Events: ${DBG.counters.events}`;
  }

  // ══════════════════════════════════════════════════════════════════════
  // 7. EXPORT & CLEAR ACTIONS
  // ══════════════════════════════════════════════════════════════════════
  function exportTraceSession() {
    const exportData = {
      exportedAt: new Date().toISOString(),
      targetUrl: DBG.targetUrl,
      counters: DBG.counters,
      apexCalls: DBG.apexCalls,
      flowLogs: DBG.flowLogs,
      components: DBG.components,
      events: DBG.events,
      vfCalls: DBG.vfCalls,
      variables: Array.from(DBG.autoVariables.entries())
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sf-debug-session-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ══════════════════════════════════════════════════════════════════════
  // 8. INITIALIZATION & UI LISTENERS
  // ══════════════════════════════════════════════════════════════════════
  function init() {
    // Tab Switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.debug-panel').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(btn.dataset.tab).classList.add('active');
      };
    });

    // Recording Toggle
    const btnRecord = document.getElementById('btnToggleRecording');
    btnRecord.onclick = () => {
      DBG.isRecording = !DBG.isRecording;
      btnRecord.className = `btn btn-record ${DBG.isRecording ? '' : 'paused'}`;
      document.getElementById('recordText').textContent = DBG.isRecording ? 'Recording' : 'Paused';
    };

    // Scan DOM Button
    document.getElementById('btnRefreshComponents').onclick = requestComponentScan;

    // Export Button
    document.getElementById('btnExport').onclick = exportTraceSession;

    // Log Category Filter
    const catSelect = document.getElementById('logCategoryFilter');
    if (catSelect) {
      catSelect.onchange = (e) => {
        DBG.activeLogCategory = e.target.value;
        document.querySelectorAll('#apexLogList .log-row').forEach(row => {
          const rowCat = row.dataset.category;
          row.style.display = (DBG.activeLogCategory === 'ALL' || rowCat === DBG.activeLogCategory) ? '' : 'none';
        });
      };
    }

    // Copy Raw Apex Log Button
    const btnCopyRaw = document.getElementById('btnCopyRawLog');
    if (btnCopyRaw) {
      btnCopyRaw.onclick = () => {
        if (!DBG.rawLogBuffer) return;
        navigator.clipboard.writeText(DBG.rawLogBuffer).then(() => {
          const prev = btnCopyRaw.textContent;
          btnCopyRaw.textContent = '✅ Copied!';
          setTimeout(() => { btnCopyRaw.textContent = prev; }, 1500);
        });
      };
    }

    // Toggle Raw Log View Button
    const btnToggleLog = document.getElementById('btnToggleLogView');
    if (btnToggleLog) {
      btnToggleLog.onclick = () => {
        DBG.isRawLogView = !DBG.isRawLogView;
        const split = document.getElementById('apexLogSplitView');
        const raw = document.getElementById('apexLogRawContainer');
        if (DBG.isRawLogView) {
          split.style.display = 'none';
          raw.style.display = 'block';
          btnToggleLog.textContent = '📊 Table View';
        } else {
          split.style.display = 'flex';
          raw.style.display = 'none';
          btnToggleLog.textContent = '📄 Raw Text View';
        }
      };
    }

    // Clear Button
    document.getElementById('btnClear').onclick = () => {
      DBG.apexLogEntries = [];
      DBG.rawLogBuffer = '';
      const rawTextEl = document.getElementById('apexLogRawText');
      if (rawTextEl) rawTextEl.textContent = '';
      const apexLogListEl = document.getElementById('apexLogList');
      if (apexLogListEl) apexLogListEl.innerHTML = '<div class="empty-hint">Waiting for user interaction or code execution... Interact with the page to stream Apex-style debug logs.</div>';
      const apexLogDetailEl = document.getElementById('apexLogDetail');
      if (apexLogDetailEl) apexLogDetailEl.innerHTML = '<div class="empty-hint">Select any log line on the left to inspect exact executed code, variable state, and callout payload.</div>';

      DBG.apexCalls = [];
      DBG.flowLogs = [];
      DBG.events = [];
      DBG.vfCalls = [];
      DBG.autoVariables.clear();
      DBG.watchedExpressions = [];
      Object.keys(DBG.counters).forEach(k => {
        DBG.counters[k] = 0;
        updateBadge(k, 0);
      });

      ['apexList', 'apexDetail', 'flowList', 'flowDetail', 'componentTree', 'componentDetail', 'autoVarsList', 'watchedItemsList', 'eventsList', 'eventDetail', 'vfList', 'vfDetail'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = '<div class="empty-hint">Cleared.</div>';
      });
    };

    // Add Watch Expression
    document.getElementById('btnAddWatch').onclick = () => {
      const inp = document.getElementById('txtWatchExpr');
      if (inp.value.trim()) {
        addCustomWatch(inp.value.trim());
        inp.value = '';
      }
    };
    document.getElementById('txtWatchExpr').onkeydown = (e) => {
      if (e.key === 'Enter') document.getElementById('btnAddWatch').click();
    };

    // Filter Input
    document.getElementById('logFilter').oninput = (e) => {
      const q = e.target.value.toLowerCase();
      document.querySelectorAll('.log-row, .timeline-entry, .tree-node').forEach(item => {
        item.style.display = (!q || item.textContent.toLowerCase().includes(q)) ? '' : 'none';
      });
    };

    // Real JS Source Mapper Modal Listeners
    const btnOpenSource = document.getElementById('btnOpenSourceMap');
    const modal = document.getElementById('sourceMapperModal');
    const btnCloseModal = document.getElementById('btnCloseSourceMapper');
    const btnSaveSource = document.getElementById('btnSaveSourceMap');
    const btnLoadPredefined = document.getElementById('btnLoadPredefinedSource');
    const txtCompName = document.getElementById('txtSourceCompName');
    const txtCode = document.getElementById('txtSourceCode');
    const statusEl = document.getElementById('sourceMapperStatus');

    if (btnOpenSource && modal) {
      btnOpenSource.onclick = () => {
        modal.style.display = 'flex';
        const curr = txtCompName.value.trim() || 'cma_summarizeCoverages';
        const existing = getRealSourceFile(curr);
        if (existing) {
          txtCode.value = existing;
          statusEl.textContent = 'Loaded mapped source for ' + curr;
        } else {
          txtCode.value = PRELOADED_REAL_SOURCES['cma_summarizeCoverages'] || '';
          statusEl.textContent = 'Default template ready';
        }
      };

      btnCloseModal.onclick = () => {
        modal.style.display = 'none';
      };

      modal.onclick = (e) => {
        if (e.target === modal) modal.style.display = 'none';
      };

      btnLoadPredefined.onclick = () => {
        txtCompName.value = 'cma_summarizeCoverages';
        txtCode.value = PRELOADED_REAL_SOURCES['cma_summarizeCoverages'] || '';
        statusEl.textContent = 'Preloaded cma_summarizeCoverages.js';
      };

      btnSaveSource.onclick = () => {
        const comp = txtCompName.value.trim();
        const src = txtCode.value;
        if (!comp) {
          statusEl.textContent = 'Please enter a component name.';
          return;
        }
        if (!src.trim()) {
          statusEl.textContent = 'Please paste source code.';
          return;
        }
        saveRealSourceFile(comp, src);
        statusEl.textContent = '✅ Source saved & mapped for ' + comp + ' (' + src.split('\n').length + ' lines)';
        setTimeout(() => {
          modal.style.display = 'none';
        }, 1200);
      };
    }

    // Detect Site Type Label
    const siteTypeBadge = document.getElementById('siteType');
    const u = DBG.targetUrl.toLowerCase();
    if (u.includes('/s/') || u.includes('/community/') || u.includes('site.com')) {
      siteTypeBadge.textContent = 'Experience Cloud / Community';
    } else if (u.includes('/apex/')) {
      siteTypeBadge.textContent = 'Visualforce Page';
    } else if (u.includes('/lightning/')) {
      siteTypeBadge.textContent = 'Lightning Experience';
    } else {
      siteTypeBadge.textContent = 'Salesforce Page';
    }

    // Auto-fetch all real LWC sources from Salesforce Org in background (No manual mapping!)
    if (DBG.baseUrl && DBG.sessionId) {
      autoFetchAllOrgLwcSource();
    }

    // Initialize Bridge
    setupInjectionBridge();

    // Initial Component Scan after 1 second
    setTimeout(requestComponentScan, 1200);

    // Watch Expressions Poller (every 2 seconds)
    setInterval(() => {
      if (DBG.isRecording && DBG.watchedExpressions.length > 0) {
        DBG.watchedExpressions.forEach(item => {
          evaluateWatchExpressionOnPage(item.id, item.expr);
        });
      }
    }, 2000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
