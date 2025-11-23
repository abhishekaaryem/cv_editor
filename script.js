// Initialize PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

// Gemini API settings (no API key here — user must enter it in the UI)
const GEMINI_API_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/';
const GEMINI_MODEL = 'gemini-2.5-flash';

// DOM Elements
const uploadSection = document.getElementById('uploadSection');
const fileInput = document.getElementById('fileInput');
const loadingSection = document.getElementById('loadingSection');
const formSection = document.getElementById('formSection');

// Counters for dynamic form elements
let expCount = 0;
let eduCount = 0;
let certCount = 0;

// Upload Section Event Listeners
uploadSection.addEventListener('click', () => fileInput.click());

uploadSection.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadSection.classList.add('dragover');
});

uploadSection.addEventListener('dragleave', () => {
    uploadSection.classList.remove('dragover');
});

uploadSection.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadSection.classList.remove('dragover');
    const files = e.dataTransfer.files;
    if (files.length > 0 && files[0].type === 'application/pdf') {
        handleFileUpload(files[0]);
    }
});

fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        handleFileUpload(e.target.files[0]);
    }
});

// Main File Upload Handler
async function handleFileUpload(file) {
    const apiKey = document.getElementById('apiKey').value.trim();
    if (!apiKey) {
        alert('Please enter your Gemini API key first!');
        return;
    }

    uploadSection.classList.add('hidden');
    loadingSection.classList.remove('hidden');

    try {
        const pdfData = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;

        const images = [];

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const viewport = page.getViewport({ scale: 2 });
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.width = viewport.width;
            canvas.height = viewport.height;

            await page.render({
                canvasContext: context,
                viewport: viewport
            }).promise;

            const imageData = canvas.toDataURL('image/png').split(',')[1];
            images.push(imageData);
        }

        const jsonString = await sendToGemini(images, apiKey);
        parseAndFillForm(jsonString);
        formSection.classList.remove('hidden');

    } catch (error) {
        console.error('Error:', error);
        let errorMessage = 'Error processing PDF: ' + error.message;

        if (error.message.includes('API key')) {
            errorMessage = 'Invalid Gemini API key. Please check your API key and try again.\n\nGet your API key from: https://aistudio.google.com/apikey';
        } else if (error.message.includes('quota')) {
            errorMessage = 'API quota exceeded. Please check your Gemini API usage limits.';
        }

        alert(errorMessage);
        uploadSection.classList.remove('hidden');
    } finally {
        loadingSection.classList.add('hidden');
    }
}

// Send PDF images to Gemini API
async function sendToGemini(images, apiKey) {
    try {
        const parts = [
            {
                text: `Extract all data from this CV/resume. Return ONLY a valid JSON object with this structure:
                {
                  "personalInfo": { "name": "", "email": "", "phone": "", "linkedin": "", "location": "" },
                  "summary": "",
                  "experience": [{ "company": "", "position": "", "startDate": "", "endDate": "", "responsibilities": "" }],
                  "education": [{ "institution": "", "degree": "", "year": "", "gpa": "" }],
                  "skills": ["skill1", "skill2"],
                  "certifications": [{ "name": "", "year": "" }],
                  "languages": ""
                }
                Do not include markdown formatting or explanations.`
            }
        ];

        images.forEach(image => {
            parts.push({
                inline_data: {
                    mime_type: "image/png",
                    data: image
                }
            });
        });

        const response = await fetch(`${GEMINI_API_ENDPOINT}${GEMINI_MODEL}:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                contents: [{
                    parts: parts
                }]
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Gemini API Error: ${errorData.error?.message || response.statusText}`);
        }

        const data = await response.json();

        if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
            throw new Error('Invalid response from Gemini API');
        }

        return data.candidates[0].content.parts[0].text;
    } catch (error) {
        console.error('Gemini API Error:', error);
        throw new Error(`Failed to process with Gemini: ${error.message}`);
    }
}

// Parse JSON and fill form
function parseAndFillForm(jsonString) {
    try {
        // Clean the string to ensure it's valid JSON
        const cleanJson = jsonString.replace(/```json/g, '').replace(/```/g, '').trim();
        const data = JSON.parse(cleanJson);

        // Personal Info
        if (data.personalInfo) {
            document.getElementById('fullName').value = data.personalInfo.name || '';
            document.getElementById('email').value = data.personalInfo.email || '';
            document.getElementById('phone').value = data.personalInfo.phone || '';
            document.getElementById('linkedin').value = data.personalInfo.linkedin || '';
            document.getElementById('location').value = data.personalInfo.location || '';
        }

        // Summary
        document.getElementById('summary').value = data.summary || '';

        // Languages
        document.getElementById('languages').value = data.languages || '';

        // Experience
        document.getElementById('experienceContainer').innerHTML = '';
        expCount = 0;
        if (data.experience && Array.isArray(data.experience)) {
            data.experience.forEach(exp => {
                addExperience();
                const index = expCount - 1;
                document.getElementsByName(`exp_company_${index}`)[0].value = exp.company || '';
                document.getElementsByName(`exp_position_${index}`)[0].value = exp.position || '';
                document.getElementsByName(`exp_start_${index}`)[0].value = exp.startDate || '';
                document.getElementsByName(`exp_end_${index}`)[0].value = exp.endDate || '';
                document.getElementsByName(`exp_desc_${index}`)[0].value = exp.responsibilities || '';
            });
        }

        // Education
        document.getElementById('educationContainer').innerHTML = '';
        eduCount = 0;
        if (data.education && Array.isArray(data.education)) {
            data.education.forEach(edu => {
                addEducation();
                const index = eduCount - 1;
                document.getElementsByName(`edu_institution_${index}`)[0].value = edu.institution || '';
                document.getElementsByName(`edu_degree_${index}`)[0].value = edu.degree || '';
                document.getElementsByName(`edu_year_${index}`)[0].value = edu.year || '';
                document.getElementsByName(`edu_gpa_${index}`)[0].value = edu.gpa || '';
            });
        }

        // Skills
        document.getElementById('skillsContainer').innerHTML = '';
        if (data.skills && Array.isArray(data.skills)) {
            data.skills.forEach(skill => addSkill(skill));
        }

        // Certifications
        document.getElementById('certContainer').innerHTML = '';
        certCount = 0;
        if (data.certifications && Array.isArray(data.certifications)) {
            data.certifications.forEach(cert => {
                addCertification();
                const index = certCount - 1;
                document.getElementsByName(`cert_name_${index}`)[0].value = cert.name || '';
                document.getElementsByName(`cert_year_${index}`)[0].value = cert.year || '';
            });
        }

    } catch (e) {
        console.error("Error parsing JSON:", e);
        alert("Failed to parse CV data. Please try again.");
    }
}

// Add Experience Item
function addExperience() {
    const container = document.getElementById('experienceContainer');
    const div = document.createElement('div');
    div.className = 'experience-item';
    div.innerHTML = `
        <button type="button" class="remove-btn" onclick="this.parentElement.remove()">Remove</button>
        <div class="form-group">
            <label>Company</label>
            <input type="text" name="exp_company_${expCount}" placeholder="Company Name">
        </div>
        <div class="form-group">
            <label>Position</label>
            <input type="text" name="exp_position_${expCount}" placeholder="Job Title">
        </div>
        <div class="grid-2">
            <div class="form-group">
                <label>Start Date</label>
                <input type="text" name="exp_start_${expCount}" placeholder="Jan 2020">
            </div>
            <div class="form-group">
                <label>End Date</label>
                <input type="text" name="exp_end_${expCount}" placeholder="Present">
            </div>
        </div>
        <div class="form-group">
            <label>Responsibilities</label>
            <textarea name="exp_desc_${expCount}" placeholder="Describe your responsibilities and achievements..."></textarea>
        </div>
    `;
    container.appendChild(div);
    expCount++;
}

// Add Education Item
function addEducation() {
    const container = document.getElementById('educationContainer');
    const div = document.createElement('div');
    div.className = 'education-item';
    div.innerHTML = `
        <button type="button" class="remove-btn" onclick="this.parentElement.remove()">Remove</button>
        <div class="form-group">
            <label>Institution</label>
            <input type="text" name="edu_institution_${eduCount}" placeholder="University Name">
        </div>
        <div class="form-group">
            <label>Degree</label>
            <input type="text" name="edu_degree_${eduCount}" placeholder="Bachelor of Science in Computer Science">
        </div>
        <div class="grid-2">
            <div class="form-group">
                <label>Year</label>
                <input type="text" name="edu_year_${eduCount}" placeholder="2018 - 2022">
            </div>
            <div class="form-group">
                <label>GPA (Optional)</label>
                <input type="text" name="edu_gpa_${eduCount}" placeholder="3.8/4.0">
            </div>
        </div>
    `;
    container.appendChild(div);
    eduCount++;
}

// Add Certification Item
function addCertification() {
    const container = document.getElementById('certContainer');
    const div = document.createElement('div');
    div.className = 'cert-item';
    div.innerHTML = `
        <button type="button" class="remove-btn" onclick="this.parentElement.remove()">Remove</button>
        <div class="grid-2">
            <div class="form-group">
                <label>Certification Name</label>
                <input type="text" name="cert_name_${certCount}" placeholder="AWS Certified Solutions Architect">
            </div>
            <div class="form-group">
                <label>Year</label>
                <input type="text" name="cert_year_${certCount}" placeholder="2023">
            </div>
        </div>
    `;
    container.appendChild(div);
    certCount++;
}

// Skills Input Handler
document.getElementById('skillInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        const skill = e.target.value.trim();
        if (skill) {
            addSkill(skill);
            e.target.value = '';
        }
    }
});

// Add Skill Tag
function addSkill(skillName) {
    const container = document.getElementById('skillsContainer');
    const tag = document.createElement('div');
    tag.className = 'skill-tag';
    tag.innerHTML = `
        <span>${skillName}</span>
        <button type="button" onclick="this.parentElement.remove()">×</button>
    `;
    container.appendChild(tag);
}

// Download PDF Function
function downloadPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 20;
    const lineHeight = 7;
    let y = 20;

    // Header - Name
    doc.setFontSize(24);
    doc.setFont(undefined, 'bold');
    doc.text(document.getElementById('fullName').value || 'Your Name', margin, y);
    y += 10;

    // Contact Information
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    const contactInfo = [
        document.getElementById('email').value,
        document.getElementById('phone').value,
        document.getElementById('linkedin').value,
        document.getElementById('location').value
    ].filter(v => v).join(' | ');
    doc.text(contactInfo, margin, y);
    y += 15;

    // Professional Summary
    if (document.getElementById('summary').value) {
        doc.setFontSize(14);
        doc.setFont(undefined, 'bold');
        doc.text('PROFESSIONAL SUMMARY', margin, y);
        y += 7;

        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');
        const summary = doc.splitTextToSize(document.getElementById('summary').value, pageWidth - 2 * margin);
        doc.text(summary, margin, y);
        y += summary.length * lineHeight + 5;
    }

    // Work Experience
    const experiences = document.querySelectorAll('.experience-item');
    if (experiences.length > 0) {
        if (y > 250) {
            doc.addPage();
            y = 20;
        }

        doc.setFontSize(14);
        doc.setFont(undefined, 'bold');
        doc.text('WORK EXPERIENCE', margin, y);
        y += 10;

        experiences.forEach((exp) => {
            const company = exp.querySelector('[name^="exp_company"]').value;
            const position = exp.querySelector('[name^="exp_position"]').value;
            const start = exp.querySelector('[name^="exp_start"]').value;
            const end = exp.querySelector('[name^="exp_end"]').value;
            const desc = exp.querySelector('[name^="exp_desc"]').value;

            if (y > 270) {
                doc.addPage();
                y = 20;
            }

            doc.setFontSize(11);
            doc.setFont(undefined, 'bold');
            doc.text(position || 'Position', margin, y);
            y += 6;

            doc.setFontSize(10);
            doc.setFont(undefined, 'italic');
            doc.text(`${company || 'Company'} | ${start || 'Start'} - ${end || 'End'}`, margin, y);
            y += 6;

            doc.setFont(undefined, 'normal');
            if (desc) {
                const descLines = doc.splitTextToSize(desc, pageWidth - 2 * margin);
                doc.text(descLines, margin, y);
                y += descLines.length * lineHeight;
            }
            y += 5;
        });
    }

    // Education
    const education = document.querySelectorAll('.education-item');
    if (education.length > 0) {
        if (y > 250) {
            doc.addPage();
            y = 20;
        }

        doc.setFontSize(14);
        doc.setFont(undefined, 'bold');
        doc.text('EDUCATION', margin, y);
        y += 10;

        education.forEach((edu) => {
            const institution = edu.querySelector('[name^="edu_institution"]').value;
            const degree = edu.querySelector('[name^="edu_degree"]').value;
            const year = edu.querySelector('[name^="edu_year"]').value;
            const gpa = edu.querySelector('[name^="edu_gpa"]').value;

            if (y > 270) {
                doc.addPage();
                y = 20;
            }

            doc.setFontSize(11);
            doc.setFont(undefined, 'bold');
            doc.text(degree || 'Degree', margin, y);
            y += 6;

            doc.setFontSize(10);
            doc.setFont(undefined, 'italic');
            doc.text(`${institution || 'Institution'} | ${year || 'Year'}${gpa ? ' | GPA: ' + gpa : ''}`, margin, y);
            y += 8;
        });
    }

    // Skills
    const skills = Array.from(document.querySelectorAll('.skill-tag span')).map(s => s.textContent);
    if (skills.length > 0) {
        if (y > 250) {
            doc.addPage();
            y = 20;
        }

        doc.setFontSize(14);
        doc.setFont(undefined, 'bold');
        doc.text('SKILLS', margin, y);
        y += 8;

        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');
        const skillsText = skills.join(', ');
        const skillsLines = doc.splitTextToSize(skillsText, pageWidth - 2 * margin);
        doc.text(skillsLines, margin, y);
        y += skillsLines.length * lineHeight + 5;
    }

    // Certifications
    const certs = document.querySelectorAll('.cert-item');
    if (certs.length > 0) {
        if (y > 250) {
            doc.addPage();
            y = 20;
        }

        doc.setFontSize(14);
        doc.setFont(undefined, 'bold');
        doc.text('CERTIFICATIONS', margin, y);
        y += 10;

        certs.forEach((cert) => {
            const name = cert.querySelector('[name^="cert_name"]').value;
            const year = cert.querySelector('[name^="cert_year"]').value;

            if (y > 270) {
                doc.addPage();
                y = 20;
            }

            doc.setFontSize(10);
            doc.setFont(undefined, 'normal');
            doc.text(`• ${name || 'Certification'} (${year || 'Year'})`, margin, y);
            y += 6;
        });
        y += 3;
    }

    // Languages
    const languages = document.getElementById('languages').value;
    if (languages) {
        if (y > 260) {
            doc.addPage();
            y = 20;
        }

        doc.setFontSize(14);
        doc.setFont(undefined, 'bold');
        doc.text('LANGUAGES', margin, y);
        y += 8;

        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');
        const langLines = doc.splitTextToSize(languages, pageWidth - 2 * margin);
        doc.text(langLines, margin, y);
    }

    doc.save('CV_Updated.pdf');
}