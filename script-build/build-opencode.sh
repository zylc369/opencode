#!/usr/bin/env bash

# build-opencode.sh
#
# Build script for the opencode package
#
# Usage: ./script-build/build-opencode.sh [VERSION] [options]
#
# Arguments:
#   VERSION    Release version (e.g., v1.2.16, 1.2.16)
#              If not provided, reads from packages/opencode/package.json and
#              calculates fork version using: patch * 100 + 100000 + build_count
#              Example: official 1.3.0 -> fork 1.3.100000, 1.3.100001, 1.3.100002...
#
# Options:
#   --validate  Dry-run mode - only run validations, no release
#   -h, --help  Show this help message
#

set -euo pipefail

# Get absolute path to script directory (once at script start)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Utility functions


# Utility functions

log_info() {
    local message="$1"
    local timestamp
    timestamp=$(date +"%Y-%m-%d %H:%M:%S")
    echo "${timestamp} [INFO] ${message}" >&2
}

log_error() {
    local message="$1"
    local timestamp
    timestamp=$(date +"%Y-%m-%d %H:%M:%S")
    echo "${timestamp} [ERROR] ${message}" >&2
    return 1
}

cleanup() {
    local exit_code=$?
    if [[ ${exit_code} -ne 0 ]]; then
        local timestamp
        timestamp=$(date +"%Y-%m-%d %H:%M:%S")
        echo "${timestamp} [ERROR] Script exited with error code ${exit_code}" >&2
    fi
    exit "${exit_code}"
}
# Trap signals for cleanup
trap cleanup ERR EXIT INT

# Helper function to build gh repo argument
# Usage: gh_repo_arg "owner/repo" returns "-R owner/repo" or empty string
build_gh_repo_arg() {
    local repo="$1"
    if [[ -n "${repo}" ]]; then
        echo "-R ${repo}"
    fi
}

find_next_version() {
    local pkg_version="$1"
    local fork_repo="$2"
    
    log_info "Package.json version: ${pkg_version}"
    
    local major minor patch
    IFS='.' read -r major minor patch <<< "${pkg_version}"
    local fork_patch=$(( patch * 100 + 100000 ))
    local fork_version="${major}.${minor}.${fork_patch}"
    
    log_info "Base fork version: ${fork_version}"
    
    while check_release_exists "${fork_version}" "${fork_repo}"; do
        log_info "Release v${fork_version} already exists, incrementing build count..."
        fork_patch=$(( fork_patch + 1 ))
        fork_version="${major}.${minor}.${fork_patch}"
        log_info "Trying version: ${fork_version}"
    done
    
    log_info "Available version found: ${fork_version}"
    echo "${fork_version}"
}

# Validation functions

validate_version() {
    local version="$1"
    if [[ ! "${version}" =~ ^v?[0-9]+\.[0-9]+\.[0-9]+(\.[0-9]+)?(-[a-zA-Z0-9]+)?$ ]]; then
        log_error "Invalid version format: ${version}\nExpected format: v1.2.16, 1.2.16, 1.2.16.1, or 1.2.16.1-buwai"
        return 1
    fi
    log_info "Version validated: ${version}"
}

check_gh_cli() {
    if ! command -v gh &> /dev/null; then
        log_error "gh CLI is not installed\nPlease install from: https://cli.github.com/"
        return 1
    fi
    log_info "gh CLI found: $(command -v gh)"
}

check_gh_auth() {
    if ! gh auth status &> /dev/null; then
        log_error "gh CLI is not authenticated\nPlease run: gh auth login"
        return 1
    fi
    log_info "gh CLI authentication verified"
}

detect_git_repo() {
    local repo
    local remote_url
    
    # Try to get remote URL from git
    if ! command -v git &> /dev/null; then
        log_info "git not found, will use gh CLI default repository"
        return 0
    fi
    
    if ! git rev-parse --git-dir &> /dev/null; then
        log_info "Not in a git repository, will use gh CLI default repository"
        return 0
    fi
    
    # Get remote URL (prefer origin)
    remote_url=$(git remote get-url origin 2>/dev/null)
    if [[ -z "${remote_url}" ]]; then
        # Try to get any remote
        remote_url=$(git remote -v | head -1 | awk '{print $2}')
    fi
    
    if [[ -z "${remote_url}" ]]; then
        log_info "No git remote found, will use gh CLI default repository"
        return 0
    fi
    
    local clean_url
    clean_url="${remote_url%.git}"
    clean_url=$(echo "${clean_url}" | sed -E 's|^(https?://)[^@]+@|\1|')
    
    # Extract owner/repo based on URL format
    if [[ "${clean_url}" =~ ^https?://github\.com/ ]]; then
        # GitHub HTTPS URL: https://github.com/owner/repo
        repo="${clean_url#https://github.com/}"
        repo="${repo#http://github.com/}"
    elif [[ "${clean_url}" =~ ^git@github\.com: ]]; then
        # GitHub SSH URL: git@github.com:owner/repo
        repo="${clean_url#*:}"
    elif [[ "${clean_url}" =~ ^https?:// ]]; then
        # Generic HTTPS URL
        repo=$(echo "${clean_url}" | sed -E 's|^[^:/]+[:/]+||')
    elif [[ "${clean_url}" =~ ^git@[^:]+: ]]; then
        # Generic SSH URL
        repo="${clean_url#*:}"
    else
        log_info "Unable to parse remote URL: ${remote_url}"
        return 0
    fi
    
    echo "${repo}"
    return 0
}

install_dependencies() {
    local repo_root="${SCRIPT_DIR}/.."
    
    log_info "Upgrading bun to latest version..."
    bun upgrade || return 1
    
    log_info "Installing dependencies in project root..."
    (cd "${repo_root}" && bun i) || return 1
    
    log_info "Installing dependencies in packages/opencode..."
    (cd "${repo_root}/packages/opencode" && bun i) || return 1
    
    log_info "Dependencies installed successfully"
}

build_packages() {
    local version="$1"
    local repo="$2"
    local repo_root
    local intermediate_dir
    # Use global SCRIPT_DIR set at script start
    repo_root="${SCRIPT_DIR}/.."
    intermediate_dir="${SCRIPT_DIR}/intermediate"
    
    log_info "Starting build process..."
    
    # Build packages/opencode
    log_info "Building packages/opencode..."
    cd "${repo_root}/packages/opencode" || {
        log_error "Failed to cd to packages/opencode"
        return 1
    }
    
    # Build with environment variables - only set GH_REPO if repo is not empty
    if [[ -n "${repo}" ]]; then
        OPENCODE_VERSION="${version}" OPENCODE_RELEASE=true OPENCODE_CHANNEL=prod GH_REPO="${repo}" bun run script/build.ts || {
            log_error "Failed to build packages/opencode"
            log_info "Build log may contain more details"
            return 1
        }
    else
        OPENCODE_VERSION="${version}" OPENCODE_RELEASE=true OPENCODE_CHANNEL=prod bun run script/build.ts || {
            log_error "Failed to build packages/opencode"
            log_info "Build log may contain more details"
            return 1
        }
    fi
    
    # Build packages/app
    log_info "Building packages/app..."
    cd "${repo_root}/packages/app" || {
        log_error "Failed to cd to packages/app"
        return 1
    }
    bun run build || {
        log_error "Failed to build packages/app"
        log_info "Build log may contain more details"
        return 1
    }
    log_info "packages/app build succeeded"
    
    # Create zip from packages/app/dist
    log_info "Creating opencode-web.zip from packages/app/dist..."
    mkdir -p "${intermediate_dir}"
    if [[ -d "${repo_root}/packages/app/dist" ]]; then
        cd "${repo_root}/packages/app"
        # Use a temporary directory to get the right directory name in the archive
        local tmp_dir
        tmp_dir=$(mktemp -d)
        mkdir -p "${tmp_dir}/opencode-web"
        cp -r dist/* "${tmp_dir}/opencode-web/"
        cd "${tmp_dir}"
        zip -rq "${intermediate_dir}/opencode-web.zip" opencode-web/
        cd "${repo_root}/packages/app"
        rm -rf "${tmp_dir}"
        log_info "Created: opencode-web.zip"
    else
        log_info "Warning: packages/app/dist not found, skipping opencode-web.zip"
    fi
    
    # Prepare intermediate directory
    log_info "Preparing intermediate directory..."
    cd "${intermediate_dir}"
    
    # Copy tar.gz files from packages/opencode/dist
    log_info "Copying build artifacts to intermediate directory..."
    for file in "${repo_root}/packages/opencode/dist"/*.tar.gz "${repo_root}/packages/opencode/dist"/*.zip; do
        if [[ -f "${file}" ]]; then
            cp "${file}" .
            log_info "Copied: $(basename "${file}")"
        fi
    done
    
    # Generate checksums.txt
    log_info "Generating checksums.txt..."
    if command -v shasum &> /dev/null; then
        # macOS uses shasum
        shasum -a 256 *.tar.gz *.zip 2>/dev/null > checksums.txt
    elif command -v sha256sum &> /dev/null; then
        # Linux uses sha256sum
        sha256sum *.tar.gz *.zip 2>/dev/null > checksums.txt
    else
        log_error "Neither shasum nor sha256sum found"
        return 1
    fi
    
    log_info "Checksums generated:"
    cat checksums.txt
    
    log_info "All builds completed successfully"
    return 0
}

# Release functions

check_release_exists() {
    local version="$1"
    local repo="$2"
    # Ensure version has 'v' prefix for gh commands
    if [[ ! "${version}" =~ ^v ]]; then
        version="v${version}"
    fi
    
    local repo_arg
    repo_arg=$(build_gh_repo_arg "${repo}")
    if gh ${repo_arg} release view "${version}" &> /dev/null; then
        # Release exists - return 0 to indicate "exists"
        return 0
    fi
    # Release does not exist - return 1 to indicate "does not exist"
    return 1
}

increment_version() {
    local version="$1"
    local major minor patch
    IFS='.' read -r major minor patch <<< "${version#v}"
    # Increment build count by 1
    local new_patch=$((patch + 1))
    echo "${major}.${minor}.${new_patch}"
}

find_available_version() {
    local version="$1"
    local repo="$2"
    local display_ver="${version#v}"
    
    while check_release_exists "${version}" "${repo}"; do
        log_info "Release v${display_ver} already exists, incrementing build count..."
        version=$(increment_version "${version}")
        display_ver="${version#v}"
        log_info "Trying version: ${display_ver}"
    done
    
    log_info "Available version found: ${display_ver}"
    echo "${version#v}"
}

create_empty_release() {
    local version="$1"
    local repo="$2"
    local release_title
    
    # Ensure version has 'v' prefix
    if [[ ! "${version}" =~ ^v ]]; then
        version="v${version}"
    fi
    
    # Set release title
    release_title="OpenCode ${version}"
    
    local repo_arg
    repo_arg=$(build_gh_repo_arg "${repo}")
    # Create release without files
    log_info "Creating empty release ${version} with title '${release_title}'..."
    if ! gh ${repo_arg} release create "${version}" \
        --title "${release_title}" \
        --notes "" \
        --prerelease=false; then
        log_error "Failed to create release ${version}"
        return 1
    fi
    
    log_info "Empty release ${version} created successfully"
    return 0
}

create_release() {
    local version="$1"
    local repo="$2"
    local release_title
    local intermediate_dir
    
    # Use global SCRIPT_DIR set at script start
    intermediate_dir="${SCRIPT_DIR}/intermediate"
    # Ensure version has 'v' prefix
    if [[ ! "${version}" =~ ^v ]]; then
        version="v${version}"
    fi
    
    # Check if intermediate directory exists
    if [[ ! -d "${intermediate_dir}" ]]; then
        log_error "Intermediate directory not found: ${intermediate_dir}\nPlease run the build script to generate packages first"
        return 1
    fi
    
    # Check if checksums.txt exists
    if [[ ! -f "${intermediate_dir}/checksums.txt" ]]; then
        log_error "checksums.txt not found in ${intermediate_dir}\nPlease run the build script to generate checksums first"
        return 1
    fi
    
    # Check if there are tar.gz files
    local tar_count
    tar_count=$(find "${intermediate_dir}" -name "*.tar.gz" | wc -l)
    if [[ ${tar_count} -eq 0 ]]; then
        log_error "No tar.gz files found in ${intermediate_dir}\nPlease run the build script to generate packages first"
        return 1
    fi
    log_info "Found ${tar_count} package tar.gz files"
    
    # Set release title
    release_title="OpenCode ${version}"
    
    local repo_arg
    repo_arg=$(build_gh_repo_arg "${repo}")
    # Create release without files first
    log_info "Creating release ${version} with title '${release_title}'..."
    if ! gh ${repo_arg} release create "${version}" \
        --title "${release_title}" \
        --notes "" \
        --prerelease=false; then
        log_error "Failed to create release ${version}"
        return 1
    fi
    
    # Now upload all files from intermediate directory
    log_info "Uploading files to release ${version}..."
    if ! gh ${repo_arg} release upload "${version}" \
        --clobber \
        "${intermediate_dir}"/*.tar.gz \
        "${intermediate_dir}"/*.zip \
        "${intermediate_dir}/checksums.txt"; then
        log_error "Failed to upload files to release ${version}"
        return 1
    fi
    log_info "Release ${version} created and files uploaded successfully"
    return 0
}

verify_release() {
    local version="$1"
    local repo="$2"
    # 12 binary packages (6 tar.gz + 6 zip) + 1 opencode-web.zip + 1 checksums.txt
    local expected_assets=14
    
    # Ensure version has 'v' prefix
    if [[ ! "${version}" =~ ^v ]]; then
        version="v${version}"
    fi
    
    log_info "Verifying release ${version}..."
    
    # Build repo_arg - handle empty repo case properly
    local repo_arg=""
    if [[ -n "${repo}" ]]; then
        repo_arg="-R ${repo}"
    fi
    
    # Check if release exists
    if ! gh ${repo_arg} release view "${version}" &> /dev/null; then
        log_error "Release ${version} does not exist"
        return 1
    fi
    
    # Get release info in one call for efficiency
    local release_json
    release_json=$(gh ${repo_arg} release view "${version}" --json url,name,isPrerelease,isDraft,assets)
    local release_url
    local release_title
    local is_prerelease
    local is_draft
    local asset_count
    
    release_url=$(echo "${release_json}" | jq -r '.url')
    release_title=$(echo "${release_json}" | jq -r '.name')
    is_prerelease=$(echo "${release_json}" | jq -r '.isPrerelease')
    is_draft=$(echo "${release_json}" | jq -r '.isDraft')
    asset_count=$(echo "${release_json}" | jq '.assets | length')
    
    log_info "Release URL: ${release_url}"
    log_info "Release title: ${release_title}"
    log_info "Assets count: ${asset_count}"
    
    # Verify it's not a draft or pre-release
    if [[ "${is_draft}" == "true" ]]; then
        log_error "Release ${version} is marked as draft (should be published)"
        return 1
    fi
    
    if [[ "${is_prerelease}" == "true" ]]; then
        log_error "Release ${version} is marked as pre-release (should be published)"
        return 1
    fi
    
    # Verify asset count
    if [[ ${asset_count} -ne ${expected_assets} ]]; then
        log_error "Expected ${expected_assets} assets, but found ${asset_count}"
        return 1
    fi
    
    log_info "Release ${version} verified successfully"
    log_info "Release URL: ${release_url}"
    return 0
}

# Main

main() {
    local version=""
    local validate_only=false
    local repo=""


    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --dry-run|--validate)
                validate_only=true
                shift
                ;;

            --repo)
                repo="$2"
                shift
                shift
                ;;
            -h|--help)
    echo "Usage: $0 [VERSION] [--repo REPO] [options]"
    echo ""
    echo "  VERSION    Release version (e.g., v1.2.16, 1.2.16)"
    echo "             If not provided, auto-calculates fork version from package.json:"
    echo "               1. Read version from packages/opencode/package.json"
    echo "               2. Calculate base fork version: patch * 100 + 100000"
    echo "               3. Check if version exists on GitHub releases"
    echo "               4. If exists, increment by 1 until finding available version"
    echo "             Formula: patch * 100 + 100000"
    echo "             Example: official 1.3.0 -> 1.3.100000, 1.3.100001..."
    echo "                      official 1.3.1 -> 1.3.100100, 1.3.100101..."
    echo ""
    echo "Options:"
    echo "  --repo REPO    Target repository (e.g., owner/repo, defaults to git remote)"
    echo "  --dry-run      Dry-run mode - calculate version only, no build or release"
    echo "  --validate     Same as --dry-run (legacy alias)"
    echo "  -h, --help     Show this help message"
                exit 0
                ;;

            *)
                if [[ -z "${version}" ]]; then
                    version="$1"
                else
                    echo "Usage: $0 <VERSION> [--repo REPO] [--validate]" >&2
                    echo "Run '$0 --help' for more information" >&2
                    log_error "Unknown argument: $1"
                fi
                shift
                ;;
        esac
    done

    check_gh_cli
    check_gh_auth

    if [[ -z "${repo}" ]]; then
        repo=$(detect_git_repo)
        if [[ -n "${repo}" ]]; then
            log_info "Auto-detected repository: ${repo}"
        else
            log_info "Using gh CLI default repository"
        fi
    fi

    if [[ -z "${version}" ]]; then
        local package_json="${SCRIPT_DIR}/../packages/opencode/package.json"
        if [[ ! -f "${package_json}" ]]; then
            log_error "package.json not found at ${package_json}"
        fi
        
        local base_version
        base_version=$(jq -r '.version' "${package_json}" 2>/dev/null)
        if [[ -z "${base_version}" || "${base_version}" == "null" ]]; then
            log_error "Failed to read version from ${package_json}"
        fi
        
        version=$(find_next_version "${base_version}" "${repo}")
        log_info "Auto-generated version from package.json: ${version}"
    fi

    log_info "Starting validation..."
    validate_version "${version}"
    log_info "All validations passed"

    # If validate_only mode, exit early
    if [[ "${validate_only}" == true ]]; then
        log_info "Validation complete (dry-run mode)"
        exit 0
    fi

    log_info "Finding available version..."
    version=$(find_available_version "${version}" "${repo}")

    log_info "Creating empty release..."
    create_empty_release "${version}" "${repo}"

    install_dependencies

    # Build packages (TypeScript script will upload files now)
    build_packages "${version}" "${repo}"

    # Upload additional files (opencode-web and checksums)
    # Note: build.ts already uploaded the binary packages, we only upload what's missing
    log_info "Uploading additional files to release..."
    local intermediate_dir="${SCRIPT_DIR}/intermediate"
    
    # Build repo_arg - handle empty repo case
    local repo_arg=""
    if [[ -n "${repo}" ]]; then
        repo_arg="-R ${repo}"
    fi
    
    # Upload opencode-web.zip and checksums.txt (binaries already uploaded by build.ts)
    local files_to_upload=()
    if [[ -f "${intermediate_dir}/opencode-web.zip" ]]; then
        files_to_upload+=("${intermediate_dir}/opencode-web.zip")
    fi
    if [[ -f "${intermediate_dir}/checksums.txt" ]]; then
        files_to_upload+=("${intermediate_dir}/checksums.txt")
    fi
    
    if [[ ${#files_to_upload[@]} -gt 0 ]]; then
        log_info "Uploading: ${files_to_upload[*]}"
        if ! gh ${repo_arg} release upload "v${version}" \
            --clobber \
            "${files_to_upload[@]}"; then
            log_error "Failed to upload additional files to release"
            return 1
        fi
        log_info "Additional files uploaded successfully"
    else
        log_info "No additional files to upload"
    fi

    # Verify release
    verify_release "${version}" "${repo}"
    log_info "Release creation complete!"
}

main "$@"
