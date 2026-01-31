document.addEventListener('DOMContentLoaded', () => {
    // --- Elements ---
    const dropArea = document.getElementById('dropArea');
    const fileInput = document.getElementById('fileInput');
    const errorMsg = document.getElementById('errorMsg');

    // Main Container
    const mainContent = document.getElementById('mainContent');

    // Global Header Info
    const semesterVal = document.getElementById('semesterVal');

    // Tabs
    const tabsHeader = document.getElementById('tabsHeader');

    // Tab Content Elements
    const subjectVal = document.getElementById('subjectVal');
    const classVal = document.getElementById('classVal');
    const gradesTable = document.getElementById('gradesTable');

    // Export
    const exportBtn = document.getElementById('exportBtn');

    // --- State ---
    let classDataArray = [];
    let currentXMLDoc = null; // Store the full XML Document for export

    // --- Drag & Drop Events ---
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, e => { e.preventDefault(); e.stopPropagation(); }, false);
    });

    ['dragenter', 'dragover'].forEach(eventName => {
        dropArea.addEventListener(eventName, () => dropArea.classList.add('dragover'), false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, () => dropArea.classList.remove('dragover'), false);
    });

    dropArea.addEventListener('drop', handleDrop, false);
    fileInput.addEventListener('change', handleFiles, false);

    // Export Event
    if (exportBtn) {
        exportBtn.addEventListener('click', exportOriginalFG);
    }

    function handleDrop(e) {
        const files = e.dataTransfer.files;
        handleFiles({ target: { files: files } });
    }

    function handleFiles(e) {
        const files = e.target.files;
        if (files.length > 0) {
            const file = files[0];
            if (file.name.endsWith('.fg')) {
                processFile(file);
            } else {
                showError("Please upload a valid .fg file.");
            }
        }
    }

    // --- Processing ---
    function showError(msg) {
        errorMsg.textContent = msg;
        errorMsg.classList.remove('hidden');
        mainContent.classList.add('hidden');
        if (exportBtn) exportBtn.classList.add('hidden');
    }

    function clearError() {
        errorMsg.textContent = '';
        errorMsg.classList.add('hidden');
    }

    function processFile(file) {
        clearError();
        const reader = new FileReader();

        reader.onload = function (e) {
            try {
                const hexContent = e.target.result;
                const cleanedHex = hexContent.replace(/\s+/g, '');

                if (!/^[0-9a-fA-F]+$/.test(cleanedHex)) {
                    throw new Error("File content is not valid hex format.");
                }

                const xmlString = hexToUtf8(cleanedHex);
                parseAndDisplayXML(xmlString);

            } catch (err) {
                console.error(err);
                showError("Error processing file: " + err.message);
            }
        };

        reader.onerror = () => showError("Failed to read file.");
        reader.readAsText(file);
    }

    function hexToUtf8(hex) {
        const match = hex.match(/.{1,2}/g);
        if (!match) return "";
        const bytes = new Uint8Array(match.map(byte => parseInt(byte, 16)));
        return new TextDecoder().decode(bytes);
    }

    // New: Helper to convert String to Hex
    function utf8ToHex(str) {
        const encoder = new TextEncoder();
        const bytes = encoder.encode(str);
        return Array.from(bytes)
            .map(b => b.toString(16).padStart(2, '0'))
            .join(' ') // Optional: generate without space, or with space. The decoding handled space removal.
            .toUpperCase();
    }

    function parseAndDisplayXML(xmlString) {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlString, "text/xml");

        if (xmlDoc.querySelector("parsererror")) {
            throw new Error("Invalid XML decoded from file.");
        }

        currentXMLDoc = xmlDoc; // Save reference

        // Global Info
        const sem = xmlDoc.querySelector("Semester")?.textContent || "N/A";
        semesterVal.textContent = sem;

        // Parse ALL SubjectClassGrade elements
        const subjectClassNodes = xmlDoc.querySelectorAll("SubjectClassGrade");
        if (subjectClassNodes.length === 0) {
            showError("No class data found in XML.");
            return;
        }

        classDataArray = []; // Reset

        subjectClassNodes.forEach(node => {
            const subj = node.querySelector("Subject")?.textContent || "Unknown Subject";
            const cls = node.querySelector("Class")?.textContent || "Unknown Class";
            const students = node.querySelectorAll("Student");

            classDataArray.push({
                subject: subj,
                classCode: cls,
                students: students // Keep as NodeList or array of elements
            });
        });

        if (classDataArray.length > 0) {
            renderTabs();
            // Select first tab by default
            switchTab(0);
            mainContent.classList.remove('hidden');
            if (exportBtn) exportBtn.classList.remove('hidden');
        }
    }

    // --- UI Rendering ---
    function renderTabs() {
        tabsHeader.innerHTML = '';

        classDataArray.forEach((data, index) => {
            const btn = document.createElement('button');
            btn.className = 'tab-btn';
            btn.textContent = `${data.subject} - ${data.classCode}`;
            btn.onclick = () => switchTab(index);
            tabsHeader.appendChild(btn);
        });
    }

    function switchTab(index) {
        // Update Buttons
        const buttons = tabsHeader.children;
        for (let i = 0; i < buttons.length; i++) {
            if (i === index) buttons[i].classList.add('active');
            else buttons[i].classList.remove('active');
        }

        // Update Content
        const data = classDataArray[index];
        subjectVal.textContent = data.subject;
        classVal.textContent = data.classCode;

        renderTable(data.students);
    }

    function renderTable(studentsNodeList) {
        const thead = gradesTable.querySelector('thead');
        const tbody = gradesTable.querySelector('tbody');
        thead.innerHTML = '';
        tbody.innerHTML = '';

        if (!studentsNodeList || studentsNodeList.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5">No students found for this class.</td></tr>';
            return;
        }

        // --- Build Header based on the student with the most grade components ---
        let schemaStudent = studentsNodeList[0];
        let maxComponents = 0;

        studentsNodeList.forEach(student => {
            const comps = student.querySelectorAll("GradeComponent");
            if (comps.length > maxComponents) {
                maxComponents = comps.length;
                schemaStudent = student;
            }
        });

        const gradeComponents = schemaStudent.querySelectorAll("GradeComponent");

        const headerRow = document.createElement('tr');

        const headers = ['Roll Number', 'Full Name'];
        // Add dynamic grade headers
        const gradeLabels = [];
        gradeComponents.forEach(comp => {
            let label = comp.querySelector("Component")?.textContent || "Grade";

            // Clean up label
            label = label.replace(/\[Đánh giá quá trình\]/g, '')
                .replace(/\[Đánh giá cuối học phần\]/g, '')
                .replace(/Đánh giá Assignment/g, '')
                .trim();

            gradeLabels.push(label);
            headers.push(label);
        });

        headers.forEach(text => {
            const th = document.createElement('th');
            th.textContent = text;
            headerRow.appendChild(th);
        });
        thead.appendChild(headerRow);

        // --- Build Rows ---
        studentsNodeList.forEach(student => {
            const tr = document.createElement('tr');

            // Fixed Info
            const roll = student.querySelector("Roll")?.textContent || "";
            const name = student.querySelector("Name")?.textContent || "";

            [roll, name].forEach(val => {
                const td = document.createElement('td');
                td.textContent = val;
                tr.appendChild(td);
            });

            // Grades
            const sGrades = student.querySelectorAll("GradeComponent");

            if (sGrades.length === gradeLabels.length) {
                sGrades.forEach(gComp => {
                    const gradeNode = gComp.querySelector("Grade");
                    const val = gradeNode?.textContent;
                    const isNil = gradeNode?.getAttribute("xsi:nil") === "true";

                    const td = document.createElement('td');

                    // Create Input
                    const input = document.createElement('input');
                    input.type = 'text';
                    input.className = 'grade-input';
                    input.value = (isNil || !val) ? "" : val;

                    // Visual feedback for grades
                    updateInputStyle(input);

                    // Event: Update XML on change
                    input.addEventListener('input', (e) => {
                        const newValue = e.target.value.trim();

                        if (newValue === "") {
                            gradeNode.setAttribute("xsi:nil", "true");
                            gradeNode.textContent = "";
                        } else {
                            // Basic validation: only allow numbers or empty string
                            if (isValidGrade(newValue)) {
                                gradeNode.removeAttribute("xsi:nil");
                                gradeNode.textContent = newValue;
                            } else {
                                // Optionally, provide user feedback for invalid input
                                // For now, the style will indicate it's not a valid number
                            }
                        }
                        updateInputStyle(e.target);
                    });

                    td.appendChild(input);
                    tr.appendChild(td);
                });
            } else {
                gradeLabels.forEach(() => {
                    const td = document.createElement('td');
                    td.textContent = "?";
                    tr.appendChild(td);
                });
            }

            tbody.appendChild(tr);
        });
    }

    function updateInputStyle(input) {
        const val = parseFloat(input.value);
        if (isNaN(val)) {
            input.style.color = 'var(--text-color)';
        } else if (val < 5) {
            input.style.color = '#ef4444'; // Red
        } else if (val >= 9) {
            input.style.color = '#22c55e'; // Green
        } else {
            input.style.color = 'var(--text-color)';
        }
    }

    function isValidGrade(value) {
        // Allow empty string or a number (integer or float)
        return value === "" || !isNaN(parseFloat(value)) && isFinite(value);
    }

    // --- Export Logic ---
    function exportOriginalFG() {
        if (!currentXMLDoc) {
            showError("No data to export.");
            return;
        }

        try {
            // Serialize XML back to string
            const serializer = new XMLSerializer();
            let xmlString = serializer.serializeToString(currentXMLDoc);

            // Add XML declaration if missing (often dropped by parser)
            if (!xmlString.startsWith('<?xml')) {
                xmlString = '<?xml version="1.0" encoding="utf-8"?>\n' + xmlString;
            }

            // Encode to Hex
            // Note: input reader removed spaces, output generator might add them if desired.
            // The original file had groups like "3C 3F ..." (space separated).
            // Let's produce space separated pairs to look nice and match original somewhat.
            const hexString = utf8ToHex(xmlString);

            // Trigger Download
            const blob = new Blob([hexString], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'export_grade.fg';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

        } catch (err) {
            console.error(err);
            showError("Export failed: " + err.message);
        }
    }
});
