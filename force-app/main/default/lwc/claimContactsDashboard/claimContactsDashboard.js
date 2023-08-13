import { LightningElement, track } from 'lwc';
import { ShowToastEvent } from "lightning/platformShowToastEvent";
import { NavigationMixin } from 'lightning/navigation';
import getContactsFromMarketingLeadsPool from '@salesforce/apex/ClaimContactsDashboardController.getContactsFromMarketingLeadsPool';
import getContactsFromIDBGroups from '@salesforce/apex/ClaimContactsDashboardController.getContactsFromIDBGroups';
import handleColdLeadsChanges from '@salesforce/apex/ClaimContactsDashboardController.handleColdLeadsChanges';
import massChangeContactOwner from '@salesforce/apex/ClaimContactsDashboardController.massChangeContactOwner';
import claimContact from '@salesforce/apex/ClaimContactsDashboardController.claimContact';
import FORM_FACTOR from '@salesforce/client/formFactor';
import desktopView from './desktopView.html';
import mobileView from './mobileView.html';

export default class ClaimContactsDashboard extends NavigationMixin(LightningElement) {
	currentFilter = "Marketing Leads Pool";
	showSpinner = true;
	isExpanded = false;
	@track contacts = [];
	selectedContacts = [];
	rowLimit = 50;
	rowOffset = 0;
	dbRecordsTotal = null;
	maxOffset = 2000;
	isUserAvailableForAdditionalButtons = false;
	filtersAvailableForAdditionalButtons = ["Investor Dibs Bucket - Hot", "Investor Dibs Bucket - Cold"];
	showMassChangeOwnerModal = false;
	selectedOwnerId;
	showModalSpinner = false;

	render() {
		switch (FORM_FACTOR) {
			case "Large":
				return desktopView;
			case "Small":
				return mobileView;
			default:
				return desktopView;
		}
	}

	connectedCallback() {
		if (FORM_FACTOR == 'Small') {
			this.rowLimit = 500;
		}

		this.getMarketingLeadsPoolContacts(this.rowLimit, this.rowOffset);
	}

	getMarketingLeadsPoolContacts(limit, offset) {
		getContactsFromMarketingLeadsPool({limitSize: limit, offset: offset}).then(result => {
			this.dbRecordsTotal = result.totalRecords;
			this.contacts = this.contacts.concat(result.contacts);
			this.isUserAvailableForAdditionalButtons = result.isAdditionalButtonsAvailable;
			this.selectedContacts = [];
			this.showSpinner = false;
		})
		.catch(error => {
			this.showToast(error.message || error.body?.message, "error", "Error");
			this.showSpinner = false;
		});
	}

	getInvestorDibsBucketContacts(coldLeads, limit, offset) {
		getContactsFromIDBGroups({ coldLeads: coldLeads, limitSize: limit, offset: offset }).then(result => {
			this.dbRecordsTotal = result.totalRecords;
			this.contacts = this.contacts.concat(result.contacts);
			this.selectedContacts = [];
			this.showSpinner = false;
		})
		.catch(error => {
			this.showToast(error.message || error.body?.message, "error", "Error");
			this.showSpinner = false;
		});
	}

	get filterOptions() {
		return [
			{ value: "Marketing Leads Pool", label: "Marketing Leads Pool" },
			{ value: "Investor Dibs Bucket - Hot", label: "Investor Dibs Bucket - Hot" },
			{ value: "Investor Dibs Bucket - Cold", label: "Investor Dibs Bucket - Cold" }
		];
	}

	get columns() {
		return [
			{ label: "Name", fieldName: "name", type: "text", hideDefaultActions: true },
			{ label: "Mailing Zip/Postal Code", fieldName: "zipCode", type: "text", hideDefaultActions: true },
			{ label: "Sub Territory", fieldName: "subTerritory", type: "text", hideDefaultActions: true },
			{ label: "Created Date", fieldName: "createdDate", type: "date", hideDefaultActions: true,
				typeAttributes: { day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true}
			},
		];
	}
 
	get dropdownTriggerClass() {
		let staticClass = "slds-combobox slds-dropdown-trigger slds-dropdown-trigger_click";
		return this.isExpanded ? staticClass + " slds-is-open" : staticClass;
	}

	get isClaimButtonDisabled() {
		return !this.selectedContacts.length || this.selectedContacts.length > 1;
	}

	get isAdditionalButtonsDisabled() {
		return !this.selectedContacts.length;
	}

	get isAdditionalButtonsVisible() {
		return this.isUserAvailableForAdditionalButtons && this.filtersAvailableForAdditionalButtons.includes(this.currentFilter);
	}

	get isHotBucketFilter() {
		return this.currentFilter === "Investor Dibs Bucket - Hot";
	}

	get isColdBucketFilter() {
		return this.currentFilter === "Investor Dibs Bucket - Cold";
	}

	get maxRowSelection() {
		return this.isAdditionalButtonsVisible ? 200 : 1;
	}

	get selectedContactCount() {
		return this.selectedContacts.length;
	}

	handleActionSelect(event) {
		const selectedItemValue = event.detail.value;

		switch (selectedItemValue) {
			case "claimContact":
				return this.claimCurrentContact();
			case "massChangeOwner":
				return this.openMassChangeOwnerModal();
			case "moveToHotBucket":
				return this.moveToHotBucket();
			case "moveToColdBucket":
				return this.moveToColdBucket();
			default:
				return;
		}
	}

	handleFilterChangeButton(event) {
		this.currentFilter = event.target.dataset.filter;
		this.isExpanded = !this.isExpanded;

		this.refreshComponent();
	}

	handleMobileCheckbox(event) {
		const isCheckboxChecked = event.target.checked;
		const contact = { id: event.target.value };
		if (isCheckboxChecked) {
			let alreadySelectedContacts = [...this.selectedContacts];
			alreadySelectedContacts.push(contact);
			this.selectedContacts = alreadySelectedContacts;
		} else {
			this.selectedContacts = this.selectedContacts.filter(item => item.id !== contact.id);
		}
	}

	openMassChangeOwnerModal() {
		this.showMassChangeOwnerModal = true;
	}

	closeMassChangeOwnerModal() {
		this.showMassChangeOwnerModal = false;
		this.selectedOwnerId = "";
	}

	handleMassChangeOwner() {
		this.showModalSpinner = true;

		if (!this.selectedOwnerId) {
			this.showToast("Please select a new owner for contacts", "error", "");
			this.showModalSpinner = false;
			return;
		}
		const contactIds = this.selectedContacts.map(item => { return item.id });
		massChangeContactOwner({ contactIds: contactIds, newOwnerId: this.selectedOwnerId })
			.then(() => {
				this.showToast("Contacts have been transfered to the new owner successfully", "success", "");
				this.selectedOwnerId = "";
				this.closeMassChangeOwnerModal();
				this.showSpinner = true;
				this.showModalSpinner = false;
				this.clearOwnedContacts(contactIds);
			})
			.catch(error => {
				this.showToast(error.message || error.body?.message, "error", "Error");
				this.closeMassChangeOwnerModal();
				this.showSpinner = false;
				this.showModalSpinner = false;
			});
	}

	handleClickExtend() {
		this.isExpanded = !this.isExpanded;
	}

	handleSelectedContacts(event) {
		this.selectedContacts = event.detail.selectedRows;
	}

	handleSelectedOwner(event) {
		this.showSpinner = true;
		this.selectedOwnerId = event.detail.selectedId;
		this.showSpinner = false;
	}

	moveToColdBucket() {
		this.handleLeadBucketChanges(true);
	}

	moveToHotBucket() {
		this.handleLeadBucketChanges(false);
	}

	handleLeadBucketChanges(isCold) {
		this.showSpinner = true;
		const contactIds = this.selectedContacts.map(item => { return item.id });

		handleColdLeadsChanges({ contactIds: contactIds, isCold: isCold })
			.then(() => {
				const typeOfBucket = isCold ? "Cold" : "Hot";
				this.showToast("Contacts have been moved to " + typeOfBucket + " Bucket successfully", "success", "");
				this.refreshComponent();
			})
			.catch(error => {
				this.showToast(error.message || error.body?.message, "error", "Error");
				this.showSpinner = false;
			});
	}

	claimCurrentContact() {
		this.showSpinner = true;
		const contactId = this.selectedContacts[0]?.id;

		claimContact({ recordId: contactId }).then(() => {
			this[NavigationMixin.Navigate]({
				type: "standard__recordPage",
				attributes: {
					recordId: contactId,
					objectApiName: "Contact",
					actionName: "view"
				}
			});
		})
		.catch(error => {
			this.showToast(error.message || error.body?.message, "error", "Error");
		})
		.finally(() => {
			this.clearOwnedContacts([contactId]);
		});
	}

	clearOwnedContacts(contactIds) {
		let contacts = this.contacts.filter(item => !contactIds.includes(item.id));
		this.contacts = [];
		this.contacts = contacts;
		this.showSpinner = false;
	}

	refreshComponent() {
		this.rowOffset = 0;
		this.showSpinner = true;
		this.dbRecordsTotal = null;
		this.contacts = [];
		switch (this.currentFilter) {
			case "Investor Dibs Bucket - Hot":
				return this.getInvestorDibsBucketContacts(false, this.rowLimit, this.rowOffset);
			case "Investor Dibs Bucket - Cold":
				return this.getInvestorDibsBucketContacts(true, this.rowLimit, this.rowOffset);
			case "Marketing Leads Pool":
				return this.getMarketingLeadsPoolContacts(this.rowLimit, this.rowOffset);
			default:
				return this.getMarketingLeadsPoolContacts(this.rowLimit, this.rowOffset);
		}
	}

	loadMoreData(event) {
		let currentRecordsCount = this.contacts.length;
		if (currentRecordsCount >= this.dbRecordsTotal || this.rowOffset == 2000 || this.rowOffset > currentRecordsCount) {
			return;
		}

		this.rowOffset = this.rowOffset + this.rowLimit;

		if (this.rowOffset < 0) {
			this.rowOffset = 0;
		} else if (this.rowOffset > 2000) {
			this.rowOffset = 2000;
		}

		this.showSpinner = true;
		switch (this.currentFilter) {
			case "Investor Dibs Bucket - Hot":
				return this.getInvestorDibsBucketContacts(false, this.rowLimit, this.rowOffset);
			case "Investor Dibs Bucket - Cold":
				return this.getInvestorDibsBucketContacts(true, this.rowLimit, this.rowOffset);
			case "Marketing Leads Pool":
				return this.getMarketingLeadsPoolContacts(this.rowLimit, this.rowOffset);
			default:
				return this.getMarketingLeadsPoolContacts(this.rowLimit, this.rowOffset);
		}
	}

	showToast(message, variant, title) {
		this.dispatchEvent(
			new ShowToastEvent({
				title: title,
				message: message,
				variant: variant
			})
		);
	}
}