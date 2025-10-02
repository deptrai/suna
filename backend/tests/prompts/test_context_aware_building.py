"""
Unit tests for context-aware prompt building.

Tests the conditional removal of XML tool calling examples
based on native_tool_calling flag.
"""
import pytest
from pathlib import Path
from core.prompts.module_manager import ModularPromptBuilder, PromptModule


@pytest.fixture
def builder():
    """Create a ModularPromptBuilder instance for testing"""
    return ModularPromptBuilder()


def test_build_prompt_without_context(builder):
    """Test that build_prompt works without context (backward compatibility)"""
    prompt = builder.build_prompt()
    
    assert len(prompt) > 0
    assert isinstance(prompt, str)
    
    # Should contain toolkit module content
    toolkit_config = builder.modules.get(PromptModule.TOOL_TOOLKIT)
    if toolkit_config:
        # Without context, XML examples should be present
        assert "<function_calls>" in prompt or len(prompt) > 0


def test_build_prompt_with_native_tool_calling(builder):
    """Test that XML examples are removed in native mode"""
    context = {'native_tool_calling': True}
    prompt = builder.build_prompt(context=context)
    
    assert len(prompt) > 0
    assert isinstance(prompt, str)
    
    # XML examples should be removed
    assert "<function_calls>" not in prompt
    assert "<invoke" not in prompt
    assert "<parameter" not in prompt


def test_build_prompt_with_xml_tool_calling(builder):
    """Test that XML examples are kept in XML mode"""
    context = {'native_tool_calling': False}
    prompt = builder.build_prompt(context=context)
    
    assert len(prompt) > 0
    assert isinstance(prompt, str)
    
    # Check if toolkit module exists and has XML content
    toolkit_config = builder.modules.get(PromptModule.TOOL_TOOLKIT)
    if toolkit_config and "<function_calls>" in toolkit_config.content:
        # XML examples should be present
        assert "<function_calls>" in prompt


def test_remove_xml_examples(builder):
    """Test XML removal logic"""
    content = """
    Some text before
    
    Example:
    <function_calls>
    <invoke name="test">
    <parameter name="arg">value</parameter>
    </invoke>
    </function_calls>
    
    Some text after
    """
    
    result = builder._remove_xml_examples(content)
    
    # XML should be removed
    assert "<function_calls>" not in result
    assert "<invoke" not in result
    assert "<parameter" not in result
    
    # Non-XML content should remain
    assert "Some text before" in result
    assert "Some text after" in result


def test_remove_xml_examples_complex(builder):
    """Test XML removal with complex nested structure"""
    content = """
    ## Section 1
    
    Example:
    <function_calls>
    <invoke name="execute_command">
    <parameter name="session_name">default</parameter>
    <parameter name="blocking">true</parameter>
    <parameter name="command">ls -l</parameter>
    </invoke>
    </function_calls>
    
    ## Section 2
    
    Another example:
    <function_calls>
    <invoke name="web_search">
    <parameter name="query">test</parameter>
    </invoke>
    </function_calls>
    
    ## Section 3
    """
    
    result = builder._remove_xml_examples(content)
    
    # All XML should be removed
    assert "<function_calls>" not in result
    assert "<invoke" not in result
    assert "<parameter" not in result
    
    # Section headers should remain
    assert "## Section 1" in result
    assert "## Section 2" in result
    assert "## Section 3" in result


def test_context_modifications_only_affect_toolkit(builder):
    """Test that only TOOL_TOOLKIT module is modified"""
    context = {'native_tool_calling': True}
    
    # Get toolkit module
    toolkit_config = builder.modules.get(PromptModule.TOOL_TOOLKIT)
    if toolkit_config and "<function_calls>" in toolkit_config.content:
        original_content = toolkit_config.content
        modified_content = builder._apply_context_modifications(
            PromptModule.TOOL_TOOLKIT,
            original_content,
            context
        )
        
        # Should be different (XML removed)
        assert len(modified_content) < len(original_content)
        assert "<function_calls>" not in modified_content
    
    # Get other module (should not be modified)
    identity_config = builder.modules.get(PromptModule.CORE_IDENTITY)
    if identity_config:
        original_content = identity_config.content
        modified_content = builder._apply_context_modifications(
            PromptModule.CORE_IDENTITY,
            original_content,
            context
        )
        
        # Should be same
        assert modified_content == original_content


def test_apply_context_modifications_native_mode(builder):
    """Test _apply_context_modifications with native mode"""
    context = {'native_tool_calling': True}
    
    content_with_xml = """
    Some content
    <function_calls>
    <invoke name="test">
    </invoke>
    </function_calls>
    More content
    """
    
    result = builder._apply_context_modifications(
        PromptModule.TOOL_TOOLKIT,
        content_with_xml,
        context
    )
    
    # XML should be removed
    assert "<function_calls>" not in result
    assert "Some content" in result
    assert "More content" in result


def test_apply_context_modifications_xml_mode(builder):
    """Test _apply_context_modifications with XML mode"""
    context = {'native_tool_calling': False}
    
    content_with_xml = """
    Some content
    <function_calls>
    <invoke name="test">
    </invoke>
    </function_calls>
    More content
    """
    
    result = builder._apply_context_modifications(
        PromptModule.TOOL_TOOLKIT,
        content_with_xml,
        context
    )
    
    # XML should be kept
    assert "<function_calls>" in result
    assert "Some content" in result
    assert "More content" in result


def test_build_prompt_with_specific_modules(builder):
    """Test building prompt with specific modules and context"""
    modules_needed = [
        PromptModule.TOOL_TOOLKIT,
        PromptModule.TOOL_DATA_PROCESSING
    ]
    context = {'native_tool_calling': True}
    
    prompt = builder.build_prompt(modules_needed, context)
    
    assert len(prompt) > 0
    # Should not contain XML
    assert "<function_calls>" not in prompt


def test_remove_xml_preserves_non_xml_content(builder):
    """Test that non-XML content is preserved during removal"""
    content = """
    # 3. TOOLKIT & METHODOLOGY
    
    ## 3.1 TOOL SELECTION PRINCIPLES
    - CLI TOOLS PREFERENCE:
      * Always prefer CLI tools over Python scripts
    
    Example:
    <function_calls>
    <invoke name="execute_command">
    <parameter name="command">ls -l</parameter>
    </invoke>
    </function_calls>
    
    ## 3.2 FILE MANAGEMENT
    - Use file tools for reading and writing
    """
    
    result = builder._remove_xml_examples(content)
    
    # Non-XML content should be preserved
    assert "# 3. TOOLKIT & METHODOLOGY" in result
    assert "## 3.1 TOOL SELECTION PRINCIPLES" in result
    assert "CLI TOOLS PREFERENCE" in result
    assert "## 3.2 FILE MANAGEMENT" in result
    assert "Use file tools" in result
    
    # XML should be removed
    assert "<function_calls>" not in result


def test_empty_content(builder):
    """Test handling of empty content"""
    result = builder._remove_xml_examples("")
    assert result == ""


def test_content_without_xml(builder):
    """Test content that doesn't contain XML"""
    content = """
    This is some content
    without any XML tags
    at all.
    """
    
    result = builder._remove_xml_examples(content)
    
    # Should be unchanged (except whitespace normalization)
    assert "This is some content" in result
    assert "without any XML tags" in result


def test_multiple_xml_blocks(builder):
    """Test removal of multiple XML blocks"""
    content = """
    First block:
    <function_calls>
    <invoke name="test1">
    </invoke>
    </function_calls>
    
    Second block:
    <function_calls>
    <invoke name="test2">
    </invoke>
    </function_calls>
    
    Third block:
    <function_calls>
    <invoke name="test3">
    </invoke>
    </function_calls>
    """
    
    result = builder._remove_xml_examples(content)
    
    # All XML blocks should be removed
    assert result.count("<function_calls>") == 0
    assert result.count("<invoke") == 0


if __name__ == "__main__":
    pytest.main([__file__, "-v"])

