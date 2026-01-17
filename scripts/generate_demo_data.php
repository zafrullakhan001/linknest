<?php
/**
 * Generate Demo Data Script
 * 
 * This script removes existing tiles, links, and monitors,
 * then populates the database with fictional demo data for YouTube presentations.
 */

require_once __DIR__ . '/../api/config.php';

try {
    $db = getDB();
    $db->beginTransaction();
    
    // Disable foreign key checks temporarily
    $db->exec('PRAGMA foreign_keys = OFF');
    
    echo "Clearing existing data...\n";
    
    // Delete in correct order to respect foreign keys (even though we disabled them)
    $tablesToClear = [
        'monitor_logs',
        'user_monitor_permissions',
        'monitors',
        'user_link_favorites',
        'user_tile_favorites',
        'user_tile_permissions',
        'rich_text_content',
        'links',
        'sections',
        'tabs',
        'tile_arrangements',
        'category_arrangements',
        'tiles'
    ];
    
    foreach ($tablesToClear as $table) {
        try {
            $db->exec("DELETE FROM $table");
            echo "  Cleared $table\n";
        } catch (PDOException $e) {
            echo "  Warning: Could not clear $table: " . $e->getMessage() . "\n";
        }
    }
    
    // Reset auto-increment for monitors
    try {
        $db->exec('DELETE FROM sqlite_sequence WHERE name = "monitors"');
    } catch (PDOException $e) {
        // Ignore if table doesn't have sequence
    }
    
    echo "\nGenerating demo data...\n";
    
    $currentTime = time();
    
    // ============================================
    // TILES
    // ============================================
    echo "Creating tiles...\n";
    
    $tiles = [
        // Main group (5 tiles)
        [
            'id' => 'tile_dashboard',
            'title' => 'Company Dashboard',
            'description' => 'Main operations dashboard for daily activities',
            'emoji' => '📊',
            'theme_color' => '#3B82F6',
            'group' => 'Main',
            'position' => 0
        ],
        [
            'id' => 'tile_analytics',
            'title' => 'Analytics Hub',
            'description' => 'Business intelligence and data analytics',
            'emoji' => '📈',
            'theme_color' => '#06B6D4',
            'group' => 'Main',
            'position' => 1
        ],
        [
            'id' => 'tile_hr_portal',
            'title' => 'HR Portal',
            'description' => 'Human resources and employee management',
            'emoji' => '👥',
            'theme_color' => '#14B8A6',
            'group' => 'Main',
            'position' => 2
        ],
        [
            'id' => 'tile_finance',
            'title' => 'Finance Center',
            'description' => 'Financial management and accounting tools',
            'emoji' => '💰',
            'theme_color' => '#10B981',
            'group' => 'Main',
            'position' => 3
        ],
        [
            'id' => 'tile_customer_portal',
            'title' => 'Customer Portal',
            'description' => 'Customer service and support center',
            'emoji' => '🎯',
            'theme_color' => '#F59E0B',
            'group' => 'Main',
            'position' => 4
        ],
        
        // Development group (5 tiles)
        [
            'id' => 'tile_dev_tools',
            'title' => 'Development Tools',
            'description' => 'Essential tools for developers',
            'emoji' => '⚙️',
            'theme_color' => '#10B981',
            'group' => 'Development',
            'position' => 0
        ],
        [
            'id' => 'tile_code_repos',
            'title' => 'Code Repositories',
            'description' => 'Version control and code management',
            'emoji' => '💻',
            'theme_color' => '#6366F1',
            'group' => 'Development',
            'position' => 1
        ],
        [
            'id' => 'tile_cicd',
            'title' => 'CI/CD Pipelines',
            'description' => 'Continuous integration and deployment',
            'emoji' => '🚀',
            'theme_color' => '#8B5CF6',
            'group' => 'Development',
            'position' => 2
        ],
        [
            'id' => 'tile_testing',
            'title' => 'Testing Platforms',
            'description' => 'Quality assurance and testing tools',
            'emoji' => '🧪',
            'theme_color' => '#EC4899',
            'group' => 'Development',
            'position' => 3
        ],
        [
            'id' => 'tile_api_gateway',
            'title' => 'API Management',
            'description' => 'API gateway and documentation',
            'emoji' => '🔌',
            'theme_color' => '#EF4444',
            'group' => 'Development',
            'position' => 4
        ],
        
        // Infrastructure group (5 tiles)
        [
            'id' => 'tile_cloud_services',
            'title' => 'Cloud Services',
            'description' => 'Access to cloud platforms and services',
            'emoji' => '☁️',
            'theme_color' => '#8B5CF6',
            'group' => 'Infrastructure',
            'position' => 0
        ],
        [
            'id' => 'tile_servers',
            'title' => 'Server Management',
            'description' => 'Server monitoring and administration',
            'emoji' => '🖥️',
            'theme_color' => '#06B6D4',
            'group' => 'Infrastructure',
            'position' => 1
        ],
        [
            'id' => 'tile_databases',
            'title' => 'Database Administration',
            'description' => 'Database management and monitoring',
            'emoji' => '🗄️',
            'theme_color' => '#14B8A6',
            'group' => 'Infrastructure',
            'position' => 2
        ],
        [
            'id' => 'tile_networking',
            'title' => 'Network Infrastructure',
            'description' => 'Network monitoring and configuration',
            'emoji' => '🌐',
            'theme_color' => '#3B82F6',
            'group' => 'Infrastructure',
            'position' => 3
        ],
        [
            'id' => 'tile_security',
            'title' => 'Security Center',
            'description' => 'Security monitoring and threat management',
            'emoji' => '🔒',
            'theme_color' => '#EF4444',
            'group' => 'Infrastructure',
            'position' => 4
        ],
        
        // Collaboration group (5 tiles)
        [
            'id' => 'tile_communication',
            'title' => 'Communication Hub',
            'description' => 'Team communication and collaboration tools',
            'emoji' => '💬',
            'theme_color' => '#EC4899',
            'group' => 'Collaboration',
            'position' => 0
        ],
        [
            'id' => 'tile_project_mgmt',
            'title' => 'Project Management',
            'description' => 'Project tracking and task management',
            'emoji' => '📋',
            'theme_color' => '#6366F1',
            'group' => 'Collaboration',
            'position' => 1
        ],
        [
            'id' => 'tile_file_sharing',
            'title' => 'File Sharing',
            'description' => 'Document sharing and cloud storage',
            'emoji' => '📁',
            'theme_color' => '#10B981',
            'group' => 'Collaboration',
            'position' => 2
        ],
        [
            'id' => 'tile_whiteboard',
            'title' => 'Collaborative Workspaces',
            'description' => 'Virtual whiteboards and brainstorming',
            'emoji' => '🖼️',
            'theme_color' => '#F59E0B',
            'group' => 'Collaboration',
            'position' => 3
        ],
        [
            'id' => 'tile_calendar',
            'title' => 'Scheduling & Calendar',
            'description' => 'Team calendars and meeting scheduling',
            'emoji' => '📅',
            'theme_color' => '#8B5CF6',
            'group' => 'Collaboration',
            'position' => 4
        ],
        
        // Resources group (5 tiles)
        [
            'id' => 'tile_documentation',
            'title' => 'Documentation Center',
            'description' => 'Company wiki and knowledge base',
            'emoji' => '📚',
            'theme_color' => '#F59E0B',
            'group' => 'Resources',
            'position' => 0
        ],
        [
            'id' => 'tile_training',
            'title' => 'Training & Learning',
            'description' => 'Employee training and learning resources',
            'emoji' => '🎓',
            'theme_color' => '#06B6D4',
            'group' => 'Resources',
            'position' => 1
        ],
        [
            'id' => 'tile_library',
            'title' => 'Resource Library',
            'description' => 'Templates, guides, and reference materials',
            'emoji' => '📖',
            'theme_color' => '#14B8A6',
            'group' => 'Resources',
            'position' => 2
        ],
        [
            'id' => 'tile_forms',
            'title' => 'Forms & Requests',
            'description' => 'Company forms and request management',
            'emoji' => '📝',
            'theme_color' => '#6366F1',
            'group' => 'Resources',
            'position' => 3
        ],
        [
            'id' => 'tile_support',
            'title' => 'IT Support',
            'description' => 'IT helpdesk and support tickets',
            'emoji' => '🆘',
            'theme_color' => '#EF4444',
            'group' => 'Resources',
            'position' => 4
        ]
    ];
    
    $tileStmt = $db->prepare('
        INSERT INTO tiles (id, user_id, title, description, emoji, theme_color, "group", position, created_at, visibility)
        VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, "public")
    ');
    
    foreach ($tiles as $tile) {
        $tileStmt->execute([
            $tile['id'],
            $tile['title'],
            $tile['description'],
            $tile['emoji'],
            $tile['theme_color'],
            $tile['group'],
            $tile['position'],
            $currentTime
        ]);
    }
    
    // ============================================
    // TABS AND SECTIONS
    // ============================================
    echo "Creating tabs and sections...\n";
    
    // Define structure for all tiles: [tile_id => [tab_title => [sections]]]
    $tileStructure = [
        'tile_dashboard' => ['Main' => [['id' => 'sec_dash_quick', 'title' => 'Quick Links'], ['id' => 'sec_dash_reports', 'title' => 'Reports'], ['id' => 'sec_dash_admin', 'title' => 'Admin Tools']]],
        'tile_analytics' => ['Analytics' => [['id' => 'sec_analytics_dash', 'title' => 'Dashboards'], ['id' => 'sec_analytics_reports', 'title' => 'Reports'], ['id' => 'sec_analytics_tools', 'title' => 'Analytics Tools']]],
        'tile_hr_portal' => ['HR' => [['id' => 'sec_hr_portal', 'title' => 'Employee Portal'], ['id' => 'sec_hr_payroll', 'title' => 'Payroll'], ['id' => 'sec_hr_benefits', 'title' => 'Benefits']]],
        'tile_finance' => ['Finance' => [['id' => 'sec_finance_accounting', 'title' => 'Accounting'], ['id' => 'sec_finance_invoicing', 'title' => 'Invoicing'], ['id' => 'sec_finance_reports', 'title' => 'Financial Reports']]],
        'tile_customer_portal' => ['Customer' => [['id' => 'sec_cust_portal', 'title' => 'Customer Portal'], ['id' => 'sec_cust_support', 'title' => 'Support'], ['id' => 'sec_cust_tickets', 'title' => 'Tickets']]],
        
        'tile_dev_tools' => ['Development' => [['id' => 'sec_dev_code', 'title' => 'Repositories'], ['id' => 'sec_dev_ci', 'title' => 'CI/CD'], ['id' => 'sec_dev_testing', 'title' => 'Testing']]],
        'tile_code_repos' => ['Repositories' => [['id' => 'sec_repos_git', 'title' => 'Git Services'], ['id' => 'sec_repos_mercurial', 'title' => 'Mercurial'], ['id' => 'sec_repos_svn', 'title' => 'SVN']]],
        'tile_cicd' => ['CI/CD' => [['id' => 'sec_cicd_build', 'title' => 'Build Systems'], ['id' => 'sec_cicd_deploy', 'title' => 'Deployment'], ['id' => 'sec_cicd_monitoring', 'title' => 'Monitoring']]],
        'tile_testing' => ['Testing' => [['id' => 'sec_test_unit', 'title' => 'Unit Testing'], ['id' => 'sec_test_integration', 'title' => 'Integration'], ['id' => 'sec_test_performance', 'title' => 'Performance']]],
        'tile_api_gateway' => ['API' => [['id' => 'sec_api_docs', 'title' => 'Documentation'], ['id' => 'sec_api_gateway', 'title' => 'Gateway'], ['id' => 'sec_api_monitoring', 'title' => 'Monitoring']]],
        
        'tile_cloud_services' => ['Cloud' => [['id' => 'sec_cloud_aws', 'title' => 'AWS'], ['id' => 'sec_cloud_azure', 'title' => 'Azure'], ['id' => 'sec_cloud_gcp', 'title' => 'GCP']]],
        'tile_servers' => ['Servers' => [['id' => 'sec_servers_monitoring', 'title' => 'Monitoring'], ['id' => 'sec_servers_config', 'title' => 'Configuration'], ['id' => 'sec_servers_ssh', 'title' => 'Access']]],
        'tile_databases' => ['Databases' => [['id' => 'sec_db_mysql', 'title' => 'MySQL'], ['id' => 'sec_db_postgres', 'title' => 'PostgreSQL'], ['id' => 'sec_db_mongodb', 'title' => 'MongoDB']]],
        'tile_networking' => ['Network' => [['id' => 'sec_net_monitoring', 'title' => 'Monitoring'], ['id' => 'sec_net_config', 'title' => 'Configuration'], ['id' => 'sec_net_security', 'title' => 'Security']]],
        'tile_security' => ['Security' => [['id' => 'sec_sec_monitoring', 'title' => 'Threat Monitoring'], ['id' => 'sec_sec_vulnerability', 'title' => 'Vulnerability Scan'], ['id' => 'sec_sec_incident', 'title' => 'Incident Response']]],
        
        'tile_communication' => ['Communication' => [['id' => 'sec_comm_team', 'title' => 'Team Chat'], ['id' => 'sec_comm_video', 'title' => 'Video Calls'], ['id' => 'sec_comm_email', 'title' => 'Email']]],
        'tile_project_mgmt' => ['Projects' => [['id' => 'sec_proj_boards', 'title' => 'Boards'], ['id' => 'sec_proj_tasks', 'title' => 'Tasks'], ['id' => 'sec_proj_timeline', 'title' => 'Timeline']]],
        'tile_file_sharing' => ['Files' => [['id' => 'sec_file_drive', 'title' => 'Cloud Drive'], ['id' => 'sec_file_docs', 'title' => 'Documents'], ['id' => 'sec_file_media', 'title' => 'Media Library']]],
        'tile_whiteboard' => ['Workspaces' => [['id' => 'sec_whiteboard_canvas', 'title' => 'Canvas'], ['id' => 'sec_whiteboard_boards', 'title' => 'Whiteboards'], ['id' => 'sec_whiteboard_brainstorm', 'title' => 'Brainstorming']]],
        'tile_calendar' => ['Calendar' => [['id' => 'sec_cal_company', 'title' => 'Company Calendar'], ['id' => 'sec_cal_team', 'title' => 'Team Calendars'], ['id' => 'sec_cal_meetings', 'title' => 'Meetings']]],
        
        'tile_documentation' => ['Docs' => [['id' => 'sec_docs_wiki', 'title' => 'Wiki'], ['id' => 'sec_docs_api', 'title' => 'API Docs'], ['id' => 'sec_docs_guides', 'title' => 'Guides']]],
        'tile_training' => ['Training' => [['id' => 'sec_train_courses', 'title' => 'Courses'], ['id' => 'sec_train_videos', 'title' => 'Video Library'], ['id' => 'sec_train_certifications', 'title' => 'Certifications']]],
        'tile_library' => ['Library' => [['id' => 'sec_lib_templates', 'title' => 'Templates'], ['id' => 'sec_lib_guides', 'title' => 'Guides'], ['id' => 'sec_lib_resources', 'title' => 'Resources']]],
        'tile_forms' => ['Forms' => [['id' => 'sec_forms_requests', 'title' => 'Requests'], ['id' => 'sec_forms_approvals', 'title' => 'Approvals'], ['id' => 'sec_forms_surveys', 'title' => 'Surveys']]],
        'tile_support' => ['Support' => [['id' => 'sec_support_tickets', 'title' => 'Tickets'], ['id' => 'sec_support_kb', 'title' => 'Knowledge Base'], ['id' => 'sec_support_chat', 'title' => 'Live Chat']]]
    ];
    
    // Create tabs and sections for all tiles
    $tabSectionMap = [];
    foreach ($tileStructure as $tileId => $tabs) {
        foreach ($tabs as $tabTitle => $sections) {
            $tabId = 'tab_' . $tileId . '_' . strtolower(str_replace(' ', '_', $tabTitle));
            $db->exec("INSERT INTO tabs (id, tile_id, title, position) VALUES ('$tabId', '$tileId', '$tabTitle', 0)");
            
            foreach ($sections as $pos => $sec) {
                $db->exec("INSERT INTO sections (id, tile_id, tab_id, title, position) VALUES ('{$sec['id']}', '$tileId', '$tabId', '{$sec['title']}', $pos)");
                $tabSectionMap[$sec['id']] = true;
            }
        }
    }
    
    // ============================================
    // LINKS
    // ============================================
    echo "Creating links...\n";
    
    $linkStmt = $db->prepare('
        INSERT INTO links (id, section_id, label, url, position, health_status)
        VALUES (?, ?, ?, ?, ?, "unknown")
    ');
    
    $links = [
        // Dashboard sections
        ['link_dash_home', 'sec_dash_quick', 'Company Homepage', 'https://example.com', 0],
        ['link_dash_portal', 'sec_dash_quick', 'Employee Portal', 'https://portal.example.com', 1],
        ['link_dash_email', 'sec_dash_quick', 'Email System', 'https://mail.example.com', 2],
        ['link_dash_sales', 'sec_dash_reports', 'Sales Dashboard', 'https://reports.example.com/sales', 0],
        ['link_dash_hr', 'sec_dash_reports', 'HR Analytics', 'https://reports.example.com/hr', 1],
        ['link_dash_admin', 'sec_dash_admin', 'Admin Panel', 'https://admin.example.com', 0],
        
        // Analytics sections
        ['link_analytics_bi', 'sec_analytics_dash', 'Business Intelligence', 'https://bi.example.com', 0],
        ['link_analytics_reports', 'sec_analytics_reports', 'Analytics Reports', 'https://analytics.example.com', 0],
        ['link_analytics_google', 'sec_analytics_tools', 'Google Analytics', 'https://analytics.google.com', 0],
        
        // HR sections
        ['link_hr_portal', 'sec_hr_portal', 'HR Portal', 'https://hr.example.com', 0],
        ['link_hr_payroll', 'sec_hr_payroll', 'Payroll System', 'https://payroll.example.com', 0],
        ['link_hr_benefits', 'sec_hr_benefits', 'Benefits Portal', 'https://benefits.example.com', 0],
        
        // Finance sections
        ['link_finance_accounting', 'sec_finance_accounting', 'Accounting System', 'https://accounting.example.com', 0],
        ['link_finance_invoicing', 'sec_finance_invoicing', 'Invoicing Tool', 'https://invoices.example.com', 0],
        ['link_finance_reports', 'sec_finance_reports', 'Financial Reports', 'https://finance.example.com/reports', 0],
        
        // Customer Portal sections
        ['link_cust_portal', 'sec_cust_portal', 'Customer Portal', 'https://customers.example.com', 0],
        ['link_cust_support', 'sec_cust_support', 'Support Center', 'https://support.example.com', 0],
        ['link_cust_tickets', 'sec_cust_tickets', 'Ticket System', 'https://tickets.example.com', 0],
        
        // Dev Tools sections
        ['link_dev_github', 'sec_dev_code', 'GitHub', 'https://github.com/example-org', 0],
        ['link_dev_gitlab', 'sec_dev_code', 'GitLab', 'https://gitlab.com/example', 1],
        ['link_dev_jenkins', 'sec_dev_ci', 'Jenkins', 'https://jenkins.example.com', 0],
        ['link_dev_circleci', 'sec_dev_ci', 'CircleCI', 'https://circleci.com/gh/example', 1],
        ['link_dev_testrail', 'sec_dev_testing', 'TestRail', 'https://testrail.example.com', 0],
        
        // Code Repos sections
        ['link_repos_github', 'sec_repos_git', 'GitHub Enterprise', 'https://github.example.com', 0],
        ['link_repos_gitlab', 'sec_repos_git', 'GitLab Enterprise', 'https://gitlab.example.com', 1],
        ['link_repos_bitbucket', 'sec_repos_git', 'Bitbucket', 'https://bitbucket.org/example', 2],
        
        // CI/CD sections
        ['link_cicd_bamboo', 'sec_cicd_build', 'Bamboo', 'https://bamboo.example.com', 0],
        ['link_cicd_deploy', 'sec_cicd_deploy', 'Deployment Pipeline', 'https://deploy.example.com', 0],
        
        // Testing sections
        ['link_test_junit', 'sec_test_unit', 'JUnit', 'https://test.example.com/junit', 0],
        ['link_test_integration', 'sec_test_integration', 'Integration Tests', 'https://test.example.com/integration', 0],
        
        // API Gateway sections
        ['link_api_swagger', 'sec_api_docs', 'Swagger Docs', 'https://api.example.com/docs', 0],
        ['link_api_gateway', 'sec_api_gateway', 'API Gateway', 'https://gateway.example.com', 0],
        
        // Cloud Services sections
        ['link_cloud_aws_console', 'sec_cloud_aws', 'AWS Console', 'https://console.aws.amazon.com', 0],
        ['link_cloud_azure_portal', 'sec_cloud_azure', 'Azure Portal', 'https://portal.azure.com', 0],
        ['link_cloud_gcp_console', 'sec_cloud_gcp', 'GCP Console', 'https://console.cloud.google.com', 0],
        
        // Servers sections
        ['link_servers_nagios', 'sec_servers_monitoring', 'Nagios', 'https://nagios.example.com', 0],
        ['link_servers_config', 'sec_servers_config', 'Server Config', 'https://config.example.com', 0],
        
        // Databases sections
        ['link_db_mysql', 'sec_db_mysql', 'MySQL Admin', 'https://mysql.example.com', 0],
        ['link_db_postgres', 'sec_db_postgres', 'PostgreSQL', 'https://postgres.example.com', 0],
        
        // Networking sections
        ['link_net_monitoring', 'sec_net_monitoring', 'Network Monitor', 'https://network.example.com', 0],
        ['link_net_config', 'sec_net_config', 'Network Config', 'https://netconfig.example.com', 0],
        
        // Security sections
        ['link_sec_monitoring', 'sec_sec_monitoring', 'Threat Monitor', 'https://security.example.com', 0],
        ['link_sec_vulnerability', 'sec_sec_vulnerability', 'Vulnerability Scan', 'https://vuln.example.com', 0],
        
        // Communication sections
        ['link_comm_slack', 'sec_comm_team', 'Slack', 'https://example.slack.com', 0],
        ['link_comm_teams', 'sec_comm_team', 'Microsoft Teams', 'https://teams.microsoft.com', 1],
        ['link_comm_zoom', 'sec_comm_video', 'Zoom', 'https://zoom.us', 0],
        ['link_comm_meet', 'sec_comm_video', 'Google Meet', 'https://meet.google.com', 1],
        ['link_comm_email', 'sec_comm_email', 'Email System', 'https://mail.example.com', 0],
        
        // Project Management sections
        ['link_proj_jira', 'sec_proj_boards', 'Jira Boards', 'https://jira.example.com', 0],
        ['link_proj_tasks', 'sec_proj_tasks', 'Task Manager', 'https://tasks.example.com', 0],
        
        // File Sharing sections
        ['link_file_drive', 'sec_file_drive', 'Google Drive', 'https://drive.google.com', 0],
        ['link_file_docs', 'sec_file_docs', 'Google Docs', 'https://docs.google.com', 0],
        
        // Whiteboard sections
        ['link_whiteboard_miro', 'sec_whiteboard_canvas', 'Miro', 'https://miro.com', 0],
        ['link_whiteboard_mural', 'sec_whiteboard_boards', 'Mural', 'https://mural.co', 0],
        
        // Calendar sections
        ['link_cal_company', 'sec_cal_company', 'Company Calendar', 'https://calendar.example.com', 0],
        ['link_cal_team', 'sec_cal_team', 'Team Calendars', 'https://cal.example.com/teams', 0],
        
        // Documentation sections
        ['link_docs_confluence', 'sec_docs_wiki', 'Confluence', 'https://wiki.example.com', 0],
        ['link_docs_notion', 'sec_docs_wiki', 'Notion', 'https://notion.so/example', 1],
        ['link_docs_swagger', 'sec_docs_api', 'API Docs', 'https://api.example.com/docs', 0],
        
        // Training sections
        ['link_train_courses', 'sec_train_courses', 'Training Courses', 'https://training.example.com', 0],
        ['link_train_videos', 'sec_train_videos', 'Video Library', 'https://videos.example.com', 0],
        
        // Library sections
        ['link_lib_templates', 'sec_lib_templates', 'Templates', 'https://templates.example.com', 0],
        ['link_lib_guides', 'sec_lib_guides', 'User Guides', 'https://guides.example.com', 0],
        
        // Forms sections
        ['link_forms_requests', 'sec_forms_requests', 'Request Forms', 'https://forms.example.com', 0],
        ['link_forms_approvals', 'sec_forms_approvals', 'Approval System', 'https://approvals.example.com', 0],
        
        // Support sections
        ['link_support_tickets', 'sec_support_tickets', 'Support Tickets', 'https://tickets.example.com', 0],
        ['link_support_kb', 'sec_support_kb', 'Knowledge Base', 'https://kb.example.com', 0],
    ];
    
    foreach ($links as $link) {
        $linkStmt->execute($link);
    }
    
    // ============================================
    // TILE ARRANGEMENTS
    // ============================================
    echo "Creating tile arrangements...\n";
    
    $arrangementStmt = $db->prepare('
        INSERT INTO tile_arrangements (user_id, tile_id, position, group_name)
        VALUES (0, ?, ?, ?)
    ');
    
    // Arrange all 25 tiles by group with positions
    $arrangements = [
        // Main group (5 tiles)
        ['tile_dashboard', 0, 'Main'],
        ['tile_analytics', 1, 'Main'],
        ['tile_hr_portal', 2, 'Main'],
        ['tile_finance', 3, 'Main'],
        ['tile_customer_portal', 4, 'Main'],
        
        // Development group (5 tiles)
        ['tile_dev_tools', 0, 'Development'],
        ['tile_code_repos', 1, 'Development'],
        ['tile_cicd', 2, 'Development'],
        ['tile_testing', 3, 'Development'],
        ['tile_api_gateway', 4, 'Development'],
        
        // Infrastructure group (5 tiles)
        ['tile_cloud_services', 0, 'Infrastructure'],
        ['tile_servers', 1, 'Infrastructure'],
        ['tile_databases', 2, 'Infrastructure'],
        ['tile_networking', 3, 'Infrastructure'],
        ['tile_security', 4, 'Infrastructure'],
        
        // Collaboration group (5 tiles)
        ['tile_communication', 0, 'Collaboration'],
        ['tile_project_mgmt', 1, 'Collaboration'],
        ['tile_file_sharing', 2, 'Collaboration'],
        ['tile_whiteboard', 3, 'Collaboration'],
        ['tile_calendar', 4, 'Collaboration'],
        
        // Resources group (5 tiles)
        ['tile_documentation', 0, 'Resources'],
        ['tile_training', 1, 'Resources'],
        ['tile_library', 2, 'Resources'],
        ['tile_forms', 3, 'Resources'],
        ['tile_support', 4, 'Resources']
    ];
    
    foreach ($arrangements as $arr) {
        $arrangementStmt->execute($arr);
    }
    
    // ============================================
    // MONITORS
    // ============================================
    echo "Creating monitors...\n";
    
    $monitorStmt = $db->prepare('
        INSERT INTO monitors (
            name, type, target, port, keyword, interval, warning_threshold,
            is_active, tab_name, group_name, last_status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ');
    
    $monitors = [
        [
            'name' => 'Main Website',
            'type' => 'url',
            'target' => 'https://example.com',
            'port' => null,
            'keyword' => null,
            'interval' => 5,
            'warning_threshold' => 1,
            'is_active' => 1,
            'tab_name' => 'Production',
            'group_name' => 'Web Services',
            'last_status' => 'up'
        ],
        [
            'name' => 'API Gateway',
            'type' => 'url',
            'target' => 'https://api.example.com/health',
            'port' => null,
            'keyword' => 'healthy',
            'interval' => 2,
            'warning_threshold' => 1,
            'is_active' => 1,
            'tab_name' => 'Production',
            'group_name' => 'Web Services',
            'last_status' => 'up'
        ],
        [
            'name' => 'Database Server',
            'type' => 'port',
            'target' => 'db.example.com',
            'port' => 3306,
            'keyword' => null,
            'interval' => 5,
            'warning_threshold' => 2,
            'is_active' => 1,
            'tab_name' => 'Production',
            'group_name' => 'Infrastructure',
            'last_status' => 'up'
        ],
        [
            'name' => 'Redis Cache',
            'type' => 'port',
            'target' => 'redis.example.com',
            'port' => 6379,
            'keyword' => null,
            'interval' => 5,
            'warning_threshold' => 1,
            'is_active' => 1,
            'tab_name' => 'Production',
            'group_name' => 'Infrastructure',
            'last_status' => 'up'
        ],
        [
            'name' => 'Email Server',
            'type' => 'ping',
            'target' => 'mail.example.com',
            'port' => null,
            'keyword' => null,
            'interval' => 10,
            'warning_threshold' => 2,
            'is_active' => 1,
            'tab_name' => 'Production',
            'group_name' => 'Infrastructure',
            'last_status' => 'up'
        ],
        [
            'name' => 'Staging Environment',
            'type' => 'url',
            'target' => 'https://staging.example.com',
            'port' => null,
            'keyword' => null,
            'interval' => 10,
            'warning_threshold' => 1,
            'is_active' => 1,
            'tab_name' => 'Staging',
            'group_name' => 'Web Services',
            'last_status' => 'up'
        ],
        [
            'name' => 'CDN Status',
            'type' => 'url',
            'target' => 'https://cdn.example.com',
            'port' => null,
            'keyword' => null,
            'interval' => 15,
            'warning_threshold' => 1,
            'is_active' => 1,
            'tab_name' => 'Production',
            'group_name' => 'Web Services',
            'last_status' => 'up'
        ],
        [
            'name' => 'Load Balancer',
            'type' => 'ping',
            'target' => 'lb.example.com',
            'port' => null,
            'keyword' => null,
            'interval' => 5,
            'warning_threshold' => 1,
            'is_active' => 1,
            'tab_name' => 'Production',
            'group_name' => 'Infrastructure',
            'last_status' => 'up'
        ],
        [
            'name' => 'Monitoring Dashboard',
            'type' => 'url',
            'target' => 'https://monitor.example.com',
            'port' => null,
            'keyword' => 'dashboard',
            'interval' => 5,
            'warning_threshold' => 2,
            'is_active' => 1,
            'tab_name' => 'Internal',
            'group_name' => 'Tools',
            'last_status' => 'up'
        ],
        [
            'name' => 'Backup Server',
            'type' => 'port',
            'target' => 'backup.example.com',
            'port' => 22,
            'keyword' => null,
            'interval' => 30,
            'warning_threshold' => 2,
            'is_active' => 1,
            'tab_name' => 'Infrastructure',
            'group_name' => 'Storage',
            'last_status' => 'up'
        ]
    ];
    
    foreach ($monitors as $monitor) {
        $monitorStmt->execute([
            $monitor['name'],
            $monitor['type'],
            $monitor['target'],
            $monitor['port'],
            $monitor['keyword'],
            $monitor['interval'],
            $monitor['warning_threshold'],
            $monitor['is_active'],
            $monitor['tab_name'],
            $monitor['group_name'],
            $monitor['last_status'],
            $currentTime,
            $currentTime
        ]);
    }
    
    // Re-enable foreign keys
    $db->exec('PRAGMA foreign_keys = ON');
    
    $db->commit();
    
    echo "\n✅ Demo data generated successfully!\n";
    echo "\nSummary:\n";
    echo "  - Tiles: " . count($tiles) . "\n";
    echo "  - Links: " . count($links) . "\n";
    echo "  - Monitors: " . count($monitors) . "\n";
    echo "\n";
    
} catch (Exception $e) {
    if ($db->inTransaction()) {
        $db->rollBack();
    }
    echo "❌ Error: " . $e->getMessage() . "\n";
    echo "Stack trace:\n" . $e->getTraceAsString() . "\n";
    exit(1);
}
