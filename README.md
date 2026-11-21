# DHWANI — Frontline Healthcare Field Register

**DHWANI** is a voice-first healthcare field register designed for ASHA (Accredited Social Health Activist) workers in India for the PS1 Healthcare Challenge.

The system empowers ASHA workers during household visits to speak naturally in Hindi, English, and code-mixed colloquial speech (Hinglish / Awadhi / Bhojpuri mix) instead of manually filling paper registers or cumbersome mobile forms.

---

## 🎨 Phase 1 Implementation (Frontend Prototype)

The frontend is faithfully built to match the **Google Stitch** design system and specifications across all 7 reference screens:

1. **Dashboard (`/`)** [Screenshot 4]
   - ASHA worker greeting (*"Namaste, Sunita ji"*), PHC sync status (100% Updated), GPS & field mode indicators.
   - **Urgent Clinical Alert Banner** for severe anemia / high-risk follow-up with one-tap *"Call Medical Officer"* and *"View Vitals"*.
   - **Start New Household Visit Hero Card** with animated voice wave cues, field storage indicators (640 MB / 8 GB offline cache), and quick beneficiary switcher.
   - Scheduled visit progress bar (4/6 Completed, 67%), High-Priority alert counters, and follow-ups due today.
   - Recent visit activity cards with audio duration badges and pending delivery items (*"Mark Delivered"*).

2. **Ambient Listener Voice Capture** [Screenshot 1]
   - Prominent pulsing microphone with ripple waves and active timer.
   - Automatic language detection badge (*"Detected Language: Hindi (हिन्दी)"*).
   - **Live Speech Transcription Stream** with real-time text streaming, ambient noise suppression tag, and 98.4% ASR confidence metric.
   - Hands-free controls: *Stop & Review Transcript*, *Pause Recording*, and *Cancel / Discard*.
   - **ASHA Protocol Reminders**: Contextual visual cues for vitals, IFA tablets, danger signs, and next PMSMA date.

3. **Review Speech Transcript** [Screenshot 3]
   - Review step prior to clinical extraction.
   - Interactive audio player card with play/pause, waveform scrubber (00:34 / 01:42), playback speed toggle (1.0x, 1.2x, 1.5x), and audio fidelity badge (Master WAV 48 kHz).
   - **Entity Recognition Highlighting**: Color-coded inline tags for:
     - 🟢 *Medical Vitals & Dosages* (e.g. `130/85 mmHg`, `15 गोलियां बची हैं`)
     - 🔴 *Symptoms & Clinical Risks* (e.g. `bilateral pedal edema`, `सिरदर्द`)
     - 🔵 *Vaccines & Supplies* (e.g. `TT-2`)
   - Tap-to-edit inline transcript, re-listen sentence trigger, and ASHA Guidance Protocol callout (ANC Protocol 4.2).

4. **Verify Structured Visit Record** [Screenshot 2]
   - 4-Quadrant Clinical Grid:
     - **Quadrant 1 (Vitals)**: Systolic / Diastolic BP with prehypertension flag, Pulse rate (78 bpm), Maternal weight (56 kg, +2.0 kg trajectory), Gestational age (32 weeks from LMP).
     - **Quadrant 2 (Symptoms & Clinical Observations)**: Bilateral pedal edema (Grading +1), persistent headache with verbatim patient quote, active fetal movement (>10 kicks/day), and pallor status.
     - **Quadrant 3 (Medications & Nutrition)**: IFA tablet compliance, Calcium tablet stockout with `+ Dispense 30` action, and high-protein / low-salt dietary advice tags.
     - **Quadrant 4 (Immunization & Lab Status)**: TT-2 booster verification, Hemoglobin (10.2 g/dL - Mild Anemia), and red-flagged **Potential Pre-Eclampsia Alert**.
   - **Voice Read-Back & Verification**: Web Speech API audio playback with instant voice correction barge-in (`"नहीं, वजन 54 किलो है"`).

5. **Clinical Safety & Protocol Alerts** [Screenshot 6]
   - Triage warning: `PROTOCOL RED-FLAG RULE MATCHED • ANC-PIH-04`.
   - **Observed Findings Breakdown**: 3 specific triggering factors (Elevated BP 130/85, Bilateral Pedal Edema for 3 days, and Persistent Headache).
   - Standard Maternal Health Protocol callout with non-diagnostic notice.
   - **PHC Referral Protocol**: Emergency referral to Rampur PHC (2.8 km), on-duty MO Dr. Rajesh Varma, and 108 Ambulance dispatch helpline.
   - **Protocol Counseling Checklist**: Interactive counseling steps (Diet & posture, family briefing, 48-hour emergency follow-up) with Hindi audio counseling player.

6. **Household Visit History** [Screenshot 5]
   - Searchable, filterable visit log for Ward 4.
   - Filter chips: *All Visits (28)*, *High Priority / Alerts (4)*, *ANC Visits (12)*, *Immunization (9)*, *NCD / Chronic (3)*.
   - Detailed cards with audio note durations, vitals summaries, and one-tap access to the **Referral Slip**.

7. **Beneficiary Follow-up Tasks** [Screenshot 7]
   - Overdue, Due Today, and Upcoming task cards.
   - Task action buttons: *Confirm PHC Visit*, *Mark as Delivered*, *Call Beneficiary*, *Coordinate NRC*.

8. **Modals & Overlays**:
   - **Beneficiary Switcher**: Switch between synthetic beneficiaries (Pooja Devi, Meena Kumari, Aarav Sharma, Savitri Devi, Geeta Patel).
   - **Official PHC Referral Slip**: Printable/shareable MoHFW Form RCH-REF-09.
   - **Emergency MO Dialer**: Direct call simulation with Dr. Rajesh Varma (MBBS) on standby.
   - **Voice Read-Back & Barge-in Overlay**: Interactive voice verification.

---

## 📚 Public Health Protocol Sources

In compliance with Responsible AI requirements for frontline healthcare support, all danger-sign detection rules and triage protocols in DHWANI are governed strictly by deterministic public health guidelines:

1. **Ministry of Health and Family Welfare (MoHFW), Government of India**:
   - *Guidelines for Antenatal Care and Skilled Attendance at Birth by ANMs/LHVs/ASHAs*.
   - *Screening and Management of Pre-eclampsia and Eclampsia at Primary Healthcare Level* (Rule Matrix Code: `ANC-PIH-04`).
   - *Pradhan Mantri Surakshit Matritva Abhiyan (PMSMA)* Clinical Screening Protocol.
2. **National Health Mission (NHM)**:
   - *ASHA Module 6 & 7: Skills That Save Lives* (Maternal, Newborn, and Child Health).
   - Guidelines for Identification of Severe Anemia in Pregnant Women (Hb < 8.0 g/dL criteria).
3. **World Health Organization (WHO)**:
   - *Managing Complications in Pregnancy and Childbirth (MCPC): A guide for midwives and doctors*.
   - *Integrated Management of Childhood Illness (IMNCI)* danger signs.

---

## 🛡️ Responsible AI & Clinical Safety Safeguards

1. **100% Synthetic Beneficiary Data**: No real patient records are stored or processed. All names, addresses, RCH IDs, and phone numbers are synthetic examples.
2. **Deterministic Danger-Sign Escalation**: Clinical safety alerts are evaluated using deterministic threshold rules (e.g. BP >= 130/85 with persistent edema and headache in 3rd trimester -> Pre-eclampsia Protocol). **Zero AI/LLM diagnostic generation** is used for clinical decisions.
3. **Non-Diagnostic Notice**: The application explicitly alerts workers that DHWANI is a frontline recording and triage assistant, not a diagnostic medical device, and never prescribes medication.
4. **Transparent Provenance**: Original audio recordings and verbatim transcripts are preserved alongside extracted fields.
5. **Clear State Distinctions**: Unconfirmed drafts are visibly badged as `DRAFT` or `PENDING_VERIFICATION` and never confused with `CONFIRMED` or `ESCALATED` records.

---

## 🚀 Running the Prototype Locally

### Prerequisites
- Node.js (v18+ or v26+)
- npm

### Installation & Launch
```bash
# 1. Install dependencies
npm install

# 2. Start the Vite development server
npm run dev
```

Open `http://localhost:3000` (or `http://127.0.0.1:3000`) in your browser to interact with the prototype.
