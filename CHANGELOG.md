# Changelog

All notable changes to the Claude Code Web Chat project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2025-09-17

### Added
- New pct_analysis_v2 mode for enhanced analysis capabilities
- API caching mechanism for improved performance
- Local markdown rendering library integration
- Breathing light feedback effects for MCP status panel
- Green end effect for thinking process animation
- True word-by-word streaming message output

### Changed
- Optimized UI shadows and visual effects across the application
- Enhanced session operation buttons with improved visual feedback
- Improved confirmation dialog UI design
- Upgraded notification visual effects
- Title name updates for better branding
- Settings panel optimization with better user experience
- Streamlined chat settings binding to individual sessions

### Fixed
- Session skipping issue after webpage refresh
- Local settings mode synchronization problems
- Session switching failure bugs
- Performance issues in session loading
- Markdown format preservation in word-by-word output
- Typing indicator optimization

### Removed
- Cost output display to streamline interface

## [1.0.1] - 2025-09-10

### Added
- Enhanced session management with improved synchronization capabilities
- Advanced MCP server health monitoring with automatic restart functionality
- Internationalization support for annotation system
- Improved visual feedback and user interface effects
- Enhanced folding functionality for better session management

### Changed
- Optimized logo design and display
- Refined mode selection button interface for better user experience
- Improved session management folding visual effects
- Enhanced overall user interface responsiveness

### Fixed
- Various bug fixes related to session synchronization
- Performance improvements across the application
- Stability enhancements for MCP server management

### Technical Improvements
- Code optimization for better maintainability
- Enhanced error handling and logging
- Improved resource management and cleanup

## [1.0.0] - 2025-08-22

### Added
- Initial release of Claude Code Web Chat
- Basic Claude Code integration
- Web interface for interactive queries
- RESTful API endpoints for programmatic access
- MCP (Model Context Protocol) server integration
- Atlassian tools integration (Jira and Confluence)
- Rate limiting and security features
- Docker containerization support
- Comprehensive documentation and testing suite

### Features
- **General Query Interface**: Interactive web interface with streaming responses
- **MCP Server Integration**: Automatic discovery, health monitoring, and management
- **Security & Performance**: Built-in rate limiting, request throttling, and error handling
- **Development Tools**: Complete test suite, code quality tools, and development setup

### Security
- API rate limiting with configurable thresholds
- CORS configuration for cross-origin requests
- Environment-based configuration management
- Secure API key handling for external services